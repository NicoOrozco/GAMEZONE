const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = __dirname;

const products = [
  {id:1,name:'Xbox Series X',price:2499000,img:'img/xbox-series-x.png',category:'Xbox',description:'Potencia 4K y alto rendimiento.'},
  {id:2,name:'Xbox Series S',price:1499000,img:'img/xbox-series-s.png',category:'Xbox',description:'Compacta y totalmente digital.'},
  {id:3,name:'PlayStation 5',price:2899000,img:'img/ps5.png',category:'PlayStation',description:'Nueva generación de PlayStation.'},
  {id:4,name:'PlayStation 4',price:1199000,img:'img/ps4.png',category:'PlayStation',description:'Una consola clásica para jugar.'},
  {id:5,name:'Lenovo Legion Go',price:2699000,img:'img/legion-go.png',category:'Portátil',description:'Gaming portátil con Windows.'},
  {id:6,name:'Nintendo Switch',price:1699000,img:'img/nintendo-switch.png',category:'Nintendo',description:'Juega en casa o donde quieras.'}
];

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'gamezone',
  waitForConnections: true,
  connectionLimit: 10
});

app.use(express.json());
app.use(express.static(publicDir));

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      ok: true,
      service: 'GameZone API',
      database: 'MySQL conectado'
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'MySQL no está conectado.',
      error: error.message
    });
  }
});

app.post('/api/orders', async (req, res) => {
  const { customer, items, payment } = req.body || {};

  if (
    !customer?.name ||
    !customer?.phone ||
    !customer?.email ||
    !customer?.address ||
    !customer?.city ||
    !payment ||
    !Array.isArray(items) ||
    !items.length
  ) {
    return res.status(400).json({
      ok: false,
      message: 'Faltan datos obligatorios.'
    });
  }

  try {
    const normalized = [];
    let subtotal = 0;

    for (const item of items) {
      const product = products.find(
        p => p.id === Number(item.id)
      );

      const qty = Math.max(
        1,
        Math.min(20, Number(item.qty) || 1)
      );

      if (!product) {
        return res.status(400).json({
          ok: false,
          message: 'Producto no válido.'
        });
      }

      normalized.push({
        id: product.id,
        name: product.name,
        price: product.price,
        qty
      });

      subtotal += product.price * qty;
    }

    const shipping = subtotal >= 1500000 ? 0 : 25000;
    const total = subtotal + shipping;

    const codigoPedido = 'GZ-' + Date.now();

    // Guardar cliente
    const [clienteResult] = await db.execute(
      `INSERT INTO clientes
      (nombre, telefono, correo, direccion, ciudad)
      VALUES (?, ?, ?, ?, ?)`,
      [
        customer.name,
        customer.phone,
        customer.email,
        customer.address,
        customer.city
      ]
    );

    const clienteId = clienteResult.insertId;

    // Guardar pedido
    const [pedidoResult] = await db.execute(
      `INSERT INTO pedidos
      (codigo_pedido, cliente_id, metodo_pago, subtotal, envio, total)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        codigoPedido,
        clienteId,
        payment,
        subtotal,
        shipping,
        total
      ]
    );

    const pedidoId = pedidoResult.insertId;

    // Guardar productos del pedido
    for (const item of normalized) {
      const itemSubtotal = item.price * item.qty;

      await db.execute(
        `INSERT INTO detalle_pedido
        (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES (?, ?, ?, ?, ?)`,
        [
          pedidoId,
          item.id,
          item.qty,
          item.price,
          itemSubtotal
        ]
      );
    }

    const order = {
      id: codigoPedido,
      createdAt: new Date().toISOString(),
      customer,
      payment,
      items: normalized,
      subtotal,
      shipping,
      total
    };

    res.status(201).json({
      ok: true,
      message: 'Pedido guardado correctamente en MySQL.',
      order
    });

  } catch (error) {
    console.error('Error al guardar pedido:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al guardar el pedido en MySQL.',
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `GameZone ejecutándose en http://localhost:${PORT}`
  );
});