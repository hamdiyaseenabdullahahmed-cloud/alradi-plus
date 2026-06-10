// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middlewares ----------
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiter
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

// ---------- Database ----------
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'alraadi_db',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432
});

// ---------- Multer for uploads ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'assets')),
  filename: (req, file, cb) => {
    const name = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
    cb(null, name);
  }
});
const upload = multer({ storage });

// ---------- JWT ----------
const jwtSecret = process.env.JWT_SECRET || 'change_this_secret';
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---------- Auth ----------
app.post('/api/auth/register', async (req, res) => {
  const { username, password, is_admin } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3)', [username, hashed, is_admin || false]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const r = await pool.query('SELECT id, username, password, is_admin FROM users WHERE username=$1', [username]);
    if (!r.rows.length) return res.status(400).json({ error: 'Invalid credentials' });
    const user = r.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, jwtSecret, { expiresIn: '12h' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ---------- Products ----------
app.get('/api/products', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, description, price, old_price, image, category FROM products ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (err) {
    console.warn('DB fetch failed', err.message);
    res.json([]);
  }
});

app.get('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const r = await pool.query('SELECT * FROM products WHERE id=$1', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/admin/products', authenticate, upload.single('image'), async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const { name, description, price, old_price, category } = req.body;
  const image = req.file ? '/assets/' + req.file.filename : req.body.image || '/assets/product-placeholder.jpg';
  try {
    await pool.query('INSERT INTO products (name, description, price, old_price, image, category) VALUES ($1,$2,$3,$4,$5,$6)', [name, description, price, old_price, image, category]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Insert failed' });
  }
});

app.put('/api/admin/products/:id', authenticate, upload.single('image'), async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const id = req.params.id;
  const { name, description, price, old_price, category } = req.body;
  const image = req.file ? '/assets/' + req.file.filename : req.body.image;
  try {
    await pool.query('UPDATE products SET name=$1, description=$2, price=$3, old_price=$4, category=$5, image=$6 WHERE id=$7', [name, description, price, old_price, category, image, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

app.delete('/api/admin/products/:id', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const id = req.params.id;
  try {
    await pool.query('DELETE FROM products WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ---------- Orders ----------
app.post('/api/orders', authenticate, async (req, res) => {
  const { items, address } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'No items' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query('INSERT INTO orders (user_id, address, status) VALUES ($1,$2,$3) RETURNING id, created_at', [req.user.id, address || '', 'pending']);
    const orderId = orderRes.rows[0].id;
    for (const it of items) {
      const p = await client.query('SELECT price FROM products WHERE id=$1', [it.productId]);
      const price = p.rows[0] ? p.rows[0].price : 0;
      await client.query('INSERT INTO order_items (order_id, product_id, qty, price) VALUES ($1,$2,$3,$4)', [orderId, it.productId, it.qty, price]);
    }
    await client.query('COMMIT');
    res.json({ ok: true, orderId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Order failed' });
  } finally {
    client.release();
  }
});

// ---------- Invoice PDF ----------
// ---------- Invoice PDF ----------
app.get('/api/invoice/:orderId', authenticate, async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const orderQ = await pool.query(
      'SELECT o.id, o.created_at, o.address, u.username FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=$1',
      [orderId]
    );
    if (!orderQ.rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = orderQ.rows[0];
    const itemsQ = await pool.query(
      'SELECT oi.qty, oi.price, p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1',
      [orderId]
    );
    const items = itemsQ.rows;

    // Create PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);
    doc.pipe(res);

    // Header with logo if exists
    const logoPath = path.join(__dirname, 'public', 'assets', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 80 });
    }
    doc.fontSize(20).text('فاتورة شراء', 150, 50, { align: 'right' });
    doc.moveDown();

    doc.fontSize(12).text(`رقم الطلب: ${order.id}`, { align: 'right' });
    doc.text(`التاريخ: ${new Date(order.created_at).toLocaleString()}`, { align: 'right' });
    doc.text(`العميل: ${order.username}`, { align: 'right' });
    doc.text(`العنوان: ${order.address}`, { align: 'right' });
    doc.moveDown();

    // Table header
    doc.fontSize(12).text('المنتج', 50, 200);
    doc.text('الكمية', 300, 200);
    doc.text('السعر', 380, 200);
    doc.text('الإجمالي', 460, 200);
    doc.moveTo(50, 215).lineTo(550, 215).stroke();

    let y = 230;
    let total = 0;
    for (const it of items) {
      const lineTotal = Number(it.price) * Number(it.qty);
      total += lineTotal;
      doc.text(it.name, 50, y);
      doc.text(it.qty.toString(), 300, y);
      doc.text(Number(it.price).toFixed(2) + ' ر.س', 380, y);
      doc.text(lineTotal.toFixed(2) + ' ر.س', 460, y);
      y += 20;
    }

    doc.moveTo(50, y + 6).lineTo(550, y + 6).stroke();
    doc.fontSize(14).text('المجموع الكلي: ' + total.toFixed(2) + ' ر.س', 400, y + 20);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Invoice generation failed' });
  }
});

// ---------- Admin Stats ----------
app.get('/api/admin/stats', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  try {
    const r1 = await pool.query('SELECT COUNT(*) FROM products');
    const r2 = await pool.query('SELECT COUNT(*) FROM orders');
    const r3 = await pool.query('SELECT COALESCE(SUM(price*qty),0) AS revenue FROM order_items');
    res.json({
      products: r1.rows[0].count,
      orders: r2.rows[0].count,
      revenue: r3.rows[0].revenue
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stats failed' });
  }
});

// ---------- Serve static pages ----------
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/checkout.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});
app.get('/product.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

// ---------- Fallback ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Start server ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
