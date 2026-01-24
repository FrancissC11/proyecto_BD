// src/config/db.js
const sql = require('mssql'); // Importamos el paquete completo como 'sql'
require('dotenv').config();

const dbSettings = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false, 
        trustServerCertificate: true,
    },
};

async function getConnection() {
    try {
        // CORRECCIÓN AQUÍ: Usamos 'sql.connect', no 'connect' solo.
        const pool = await sql.connect(dbSettings);
        return pool;
    } catch (error) {
        console.error("Error FATAL conectando a la base de datos:", error);
    }
}

module.exports = { getConnection, sql };