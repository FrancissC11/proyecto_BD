const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const { getConnection } = require('./config/db');

// --- IMPORTAR CONTROLADORES ---
const authController = require('./controllers/authController');
const appointmentController = require('./controllers/appointmentController');
const cashierController = require('./controllers/cashierController');
const managerController = require('./controllers/managerController'); // NUEVO

// --- CONFIGURACIÓN ---
dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// --- MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar carpeta de archivos estáticos (CSS, JS, Imágenes)
app.use(express.static(path.join(__dirname, '../public')));

// ================= RUTAS =================

// --- 1. AUTENTICACIÓN ---
app.get('/', authController.showLogin); 
app.post('/', authController.login);
app.get('/register', authController.showRegister);
app.post('/register', authController.register);
app.get('/logout', authController.logout);

// --- 2. VISTAS (DASHBOARDS) ---
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/manager', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'manager.html'));
});

app.get('/user', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'user.html'));
});

app.get('/cashier', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'cashier.html'));
});

// --- 3. API (GESTIÓN DE CITAS - CLIENTE) ---
app.get('/api/form-data', appointmentController.getDataForForm);
app.get('/api/empleados', appointmentController.getEmpleados);
app.get('/api/slots', appointmentController.getAvailableSlots);
app.get('/api/mis-citas', appointmentController.getMyAppointments);
app.post('/cita/save', appointmentController.saveAppointment);
app.delete('/api/cita/:id_cita', appointmentController.cancelAppointment);

// --- 4. API (CAJERO) ---
app.get('/api/cashier/data', cashierController.getDashboardData);
app.post('/api/cashier/checkout', cashierController.processSale);

// --- 5. API (GERENTE) --- NUEVO
app.get('/api/manager/data', managerController.getDashboardData);
app.post('/api/manager/empleado', managerController.registrarEmpleado);
app.delete('/api/manager/empleado/:id_empleado', managerController.despedirEmpleado);

// ================= ARRANQUE =================

// 1. Probar conexión a BD
getConnection().then((pool) => {
    if (pool) {
        console.log('✅ Conexión a SQL Server exitosa');
    } else {
        console.error('❌ No se pudo conectar a la BD');
    }
}).catch(err => console.error('Error fatal de conexión:', err));

// 2. Iniciar Servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});