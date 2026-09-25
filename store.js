// store.js
// Almacén de pedidos MUY simple, guardado en un archivo JSON local.
// Sirve para probar el flujo completo sin montar una base de datos todavía.
//
// ⚠️ Para producción real, reemplaza esto por una base de datos (Postgres, SQLite, etc.)
// — un archivo JSON no es seguro para escrituras concurrentes ni escalable.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'orders.json');

function readAll() {
  if (!fs.existsSync(DB_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (err) {
    console.error('No se pudo leer orders.json, empezando de cero:', err.message);
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function createOrder(letterData) {
  const orders = readAll();
  const id = crypto.randomUUID();
  const expNumber = 'TLD-' + Math.floor(1000 + Math.random() * 8999);

  orders[id] = {
    id,
    expNumber,
    status: 'pending', // pending -> paid -> sent  (o "error")
    createdAt: new Date().toISOString(),
    letter: letterData, // { tema, consequences, nombre, remitente, address }
    stripeSessionId: null,
    lobLetterId: null,
    error: null,
  };

  writeAll(orders);
  return orders[id];
}

function getOrder(id) {
  const orders = readAll();
  return orders[id] || null;
}

function updateOrder(id, patch) {
  const orders = readAll();
  if (!orders[id]) return null;
  orders[id] = { ...orders[id], ...patch };
  writeAll(orders);
  return orders[id];
}

function deleteOrder(id) {
  const orders = readAll();
  if (!orders[id]) return false;
  delete orders[id];
  writeAll(orders);
  return true;
}

module.exports = { createOrder, getOrder, updateOrder, deleteOrder };
