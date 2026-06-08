const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const QRCode = require('qrcode');
const fs = require('fs');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'raadi-super-secret-key-2026';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/assets', express.static('public/assets'));

// إنشاء المجلدات
const dirs = ['./public/assets', './public/assets/sounds', './public/assets/images', './public/assets/uploads', './database'];
dirs.forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

// رفع الملفات
const storage = multer.diskStorage({
    destination: './public/assets/uploads/',
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const soundStorage = multer.diskStorage({
    destination: './public/assets/sounds/',
    filename: (req, file, cb) => { cb(null, file.originalname); }
});
const uploadSound = multer({ storage: soundStorage });

const db = new sqlite3.Database('./database/raadi.db');

// دوال مساعدة
function logError(error, context) {
    const msg = error.message || error;
    db.run(`INSERT INTO error_logs (context, message, stack) VALUES (?, ?, ?)`, [context, msg, error.stack || '']);
    console.error(`🚨 [${context}] ${msg}`);
}
function logActivity(userId, userName, action, details, ip = '') {
    db.run(`INSERT INTO activity_logs (user_id, user_name, action, details, ip) VALUES (?, ?, ?, ?, ?)`, [userId, userName, action, details, ip]);
}
function sendNotification(userId, title, message, type = 'info', link = '') {
    db.run(`INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)`, [userId, title, message, type, link]);
}
function generateToken(userId) { return jwt.sign({ userId }, SECRET_KEY, { expiresIn: '30d' }); }

// إنشاء جميع الجداول (19 جدولاً)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, phone TEXT, address TEXT, city TEXT, country TEXT, role TEXT DEFAULT 'client', loyalty_points INTEGER DEFAULT 0, tier TEXT DEFAULT 'bronze', avatar TEXT, email_verified INTEGER DEFAULT 0, reset_token TEXT, isActive INTEGER DEFAULT 1, last_login DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, name_en TEXT, slug TEXT UNIQUE, icon TEXT, image TEXT, parent_id INTEGER DEFAULT 0, level INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0, isActive INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_en TEXT, slug TEXT UNIQUE, sku TEXT UNIQUE, category_id INTEGER, category_name TEXT, price REAL NOT NULL, old_price REAL, cost_price REAL, stock INTEGER DEFAULT 0, min_stock INTEGER DEFAULT 5, weight REAL, dimensions TEXT, image TEXT, images TEXT, colors TEXT, sizes TEXT, tags TEXT, brand TEXT, description TEXT, specifications TEXT, rating REAL DEFAULT 5, reviews_count INTEGER DEFAULT 0, sold_count INTEGER DEFAULT 0, views_count INTEGER DEFAULT 0, isActive INTEGER DEFAULT 1, isFeatured INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT UNIQUE, user_id INTEGER, user_name TEXT, user_email TEXT, user_phone TEXT, address TEXT, city TEXT, country TEXT, postal_code TEXT, products TEXT, subtotal REAL, discount REAL DEFAULT 0, shipping_cost REAL DEFAULT 0, tax REAL DEFAULT 0, total REAL, coupon_code TEXT, coupon_discount REAL DEFAULT 0, payment_method TEXT, payment_status TEXT DEFAULT 'unpaid', payment_id TEXT, shipping_method TEXT, shipping_status TEXT DEFAULT 'pending', tracking_number TEXT, status TEXT DEFAULT 'pending', notes TEXT, signature TEXT, delivery_date TEXT, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS cart (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, product_id INTEGER, product_name TEXT, product_image TEXT, price REAL, quantity INTEGER DEFAULT 1, color TEXT, size TEXT, added_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS trash (id INTEGER PRIMARY KEY AUTOINCREMENT, item_type TEXT, item_id INTEGER, item_data TEXT, deleted_by INTEGER, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS error_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, context TEXT, message TEXT, stack TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS activity_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT, action TEXT, details TEXT, ip TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, description TEXT, discount_type TEXT, discount_value REAL, min_order REAL, max_discount REAL, max_uses INTEGER, used_count INTEGER DEFAULT 0, per_user_limit INTEGER DEFAULT 1, start_date DATETIME, expires_at DATETIME, isActive INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, user_id INTEGER, user_name TEXT, rating INTEGER, title TEXT, comment TEXT, images TEXT, isApproved INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT, message TEXT, type TEXT, link TEXT, is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS wishlist (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, product_id INTEGER, added_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, token TEXT, ip TEXT, user_agent TEXT, expires_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT, message TEXT, is_admin_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS maintenance_reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_name TEXT, customer_phone TEXT, reminder_date DATETIME, sent INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS heatmap_data (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, product_id INTEGER, event_type TEXT, page_url TEXT, screen_size TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS banners (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, image TEXT, link TEXT, position TEXT, sort_order INTEGER DEFAULT 0, isActive INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS sounds (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, filename TEXT, url TEXT, isActive INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    console.log('✅ تم إنشاء 19 جدولاً');

    // إضافة حساب المدير
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.get(`SELECT * FROM users WHERE email = 'admin@system.com'`, [], (err, row) => {
        if (!row) db.run(`INSERT INTO users (name, email, password, phone, role, loyalty_points, tier) VALUES (?, ?, ?, ?, ?, ?, ?)`, ['مدير النظام', 'admin@system.com', adminHash, '0500000000', 'admin', 0, 'gold']);
    });

    // إضافة الأقسام
    db.get(`SELECT * FROM categories LIMIT 1`, [], (err, row) => {
        if (!row) {
            const cats = [['الكل', 'All', 'all', '📱', '', 0, 0, 1], ['إلكترونيات', 'Electronics', 'electronics', '📱', '', 0, 1, 2], ['هواتف', 'Phones', 'phones', '📱', '', 2, 2, 3], ['أجهزة لوحية', 'Tablets', 'tablets', '📱', '', 2, 2, 4], ['أزياء', 'Fashion', 'fashion', '👕', '', 0, 1, 5], ['رجالي', 'Men', 'men', '👔', '', 5, 2, 6], ['نسائي', 'Women', 'women', '👗', '', 5, 2, 7], ['منزل ومطبخ', 'Home', 'home', '🏠', '', 0, 1, 8], ['عطور', 'Perfumes', 'perfumes', '🌸', '', 0, 1, 9], ['مكتبة', 'Books', 'books', '📚', '', 0, 1, 10], ['رياضة', 'Sports', 'sports', '⚽', '', 0, 1, 11], ['جمال وعناية', 'Beauty', 'beauty', '💄', '', 0, 1, 12]];
            cats.forEach(c => db.run(`INSERT INTO categories (name, name_en, slug, icon, image, parent_id, level, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, c));
        }
    });

    // إضافة منتجات
    db.get(`SELECT * FROM products LIMIT 1`, [], (err, row) => {
        if (!row) {
            const prods = [['iPhone 15 Pro', 'iPhone 15 Pro', 'iphone-15-pro', 'IP15P-001', 3, 'هواتف', 3999, 4599, 2800, 10, 5, 0.2, '', 'https://picsum.photos/id/1/400/400', '["https://picsum.photos/id/1/400/400"]', '["أسود","أبيض","ذهبي"]', '["128GB","256GB"]', '["apple","iphone"]', 'Apple', 'أحدث هاتف من Apple', '{}', 4.9, 0, 0, 0, 1, 1], ['ساعة ذكية', 'Smart Watch', 'smart-watch', 'SW-001', 2, 'إلكترونيات', 499, 699, 350, 20, 5, 0.1, '', 'https://picsum.photos/id/2/400/400', '["https://picsum.photos/id/2/400/400"]', '["أسود","فضي"]', '["S","M","L"]', '["ساعة","ذكية"]', 'Samsung', 'ساعة ذكية متعددة الوظائف', '{}', 4.7, 0, 0, 0, 1, 1], ['سماعات لاسلكية', 'Wireless Headphones', 'wireless-headphones', 'WH-001', 2, 'إلكترونيات', 299, 450, 200, 50, 10, 0.3, '', 'https://picsum.photos/id/3/400/400', '["https://picsum.photos/id/3/400/400"]', '["أسود","أبيض"]', '["M","L"]', '["سماعات","بلوتوث"]', 'Sony', 'سماعات عالية الجودة', '{}', 4.8, 0, 0, 0, 1, 1], ['حقيبة جلدية', 'Leather Bag', 'leather-bag', 'LB-001', 6, 'رجالي', 799, 1299, 500, 15, 3, 0.8, '', 'https://picsum.photos/id/20/400/400', '["https://picsum.photos/id/20/400/400"]', '["بني","أسود"]', '["One Size"]', '["حقيبة","جلد"]', 'Prada', 'حقيبة جلدية فاخرة', '{}', 4.9, 0, 0, 0, 1, 1], ['عطر بلو دي شانيل', 'Bleu de Chanel', 'bleu-de-chanel', 'BDC-001', 9, 'عطور', 520, 650, 400, 30, 5, 0.2, '', 'https://picsum.photos/id/21/400/400', '["https://picsum.photos/id/21/400/400"]', '["كحلي"]', '["100ml","150ml"]', '["عطر","شانيل"]', 'Chanel', 'عطر فاخر برائحة خشبية', '{}', 4.9, 0, 0, 0, 1, 1]];
            prods.forEach(p => db.run(`INSERT INTO products (name, name_en, slug, sku, category_id, category_name, price, old_price, cost_price, stock, min_stock, weight, dimensions, image, images, colors, sizes, tags, brand, description, specifications, rating, reviews_count, sold_count, views_count, isActive, isFeatured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, p));
        }
    });

    // إعدادات المتجر
    db.get(`SELECT * FROM settings WHERE key = 'site_name'`, [], (err, row) => {
        if (!row) {
            const sets = [['site_name', 'الرعدي أونلاين'], ['site_name_en', 'Raadi Online'], ['site_logo', '🛍️'], ['site_description', 'أكبر متجر إلكتروني في العالم العربي'], ['primary_color', '#b87333'], ['secondary_color', '#1a2a3a'], ['dark_mode', 'false'], ['whatsapp_number', '966500000000'], ['phone_number', '920000000'], ['email', 'info@raadi-store.com'], ['address', 'الرياض، المملكة العربية السعودية'], ['shipping_cost_domestic', '15'], ['shipping_cost_international', '50'], ['free_shipping_min', '200'], ['tax_rate', '15'], ['currency', 'ريال'], ['currency_code', 'SAR'], ['return_policy_ar', 'يمكنك إرجاع المنتج خلال 14 يوماً من تاريخ الاستلام بشرط أن يكون بحالته الأصلية.'], ['return_policy_en', 'You can return the product within 14 days of receipt provided it is in its original condition.'], ['exchange_policy_ar', 'يمكنك استبدال المنتج خلال 7 أيام من تاريخ الاستلام.'], ['exchange_policy_en', 'You can exchange the product within 7 days of receipt.'], ['sound_enabled', 'true'], ['marquee_text', '🎉 خصم 20% على أول طلب | كود: WELCOME20 | 🚚 توصيل مجاني للطلبات فوق 200 ريال | 💎 نقاط مضاعفة'], ['ar_enabled', 'true'], ['voice_assistant_enabled', 'true']];
            sets.forEach(s => db.run(`INSERT INTO settings (key, value) VALUES (?, ?)`, s));
        }
    });

    // كوبونات
    db.get(`SELECT * FROM coupons WHERE code = 'WELCOME20'`, [], (err, row) => {
        if (!row) db.run(`INSERT INTO coupons (code, description, discount_type, discount_value, min_order, max_uses, isActive) VALUES (?, ?, ?, ?, ?, ?, ?)`, ['WELCOME20', 'خصم 20% على أول طلب', 'percentage', 20, 0, 1000, 1]);
    });

    // معروضات
    db.get(`SELECT * FROM banners LIMIT 1`, [], (err, row) => {
        if (!row) { const bans = [['عرض الصيف', 'https://picsum.photos/id/0/1200/400', '/products', 'hero', 1], ['تخفيضات تصل إلى 50%', 'https://picsum.photos/id/1/1200/400', '/products', 'hero', 2], ['أحدث الهواتف', 'https://picsum.photos/id/2/1200/400', '/categories/2', 'hero', 3]]; bans.forEach(b => db.run(`INSERT INTO banners (title, image, link, position, sort_order) VALUES (?, ?, ?, ?, ?)`, b)); }
    });
});

// ========== API ==========

// المصادقة
app.post('/api/login', async (req, res) => {
    const { email, password, remember } = req.body;
    db.get(`SELECT * FROM users WHERE email = ? AND isActive = 1`, [email], async (err, user) => {
        if (err || !user) return res.json({ success: false, error: 'البريد غير موجود' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.json({ success: false, error: 'كلمة مرور خاطئة' });
        const token = generateToken(user.id);
        const expiresAt = remember ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        db.run(`INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)`, [user.id, token, expiresAt.toISOString()]);
        db.run(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);
        logActivity(user.id, user.name, 'LOGIN', 'تسجيل دخول ناجح');
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, address: user.address, city: user.city, country: user.country, role: user.role, loyalty_points: user.loyalty_points, tier: user.tier } });
    });
});

app.post('/api/register', async (req, res) => {
    const { name, email, password, phone, address, city, country } = req.body;
    if (!name || !email || !password) return res.json({ success: false, error: 'جميع الحقول مطلوبة' });
    if (email === 'admin@system.com') return res.json({ success: false, error: 'لا يمكن استخدام هذا البريد' });
    if (password.length < 6) return res.json({ success: false, error: 'كلمة المرور 6 أحرف على الأقل' });
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, existing) => {
        if (existing) return res.json({ success: false, error: 'البريد مسجل' });
        const hash = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (name, email, password, phone, address, city, country, role, loyalty_points, tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [name, email, hash, phone || '', address || '', city || '', country || 'SA', 'client', 0, 'bronze'], function(err2) {
            if (err2) return res.json({ success: false, error: err2.message });
            logActivity(this.lastID, name, 'REGISTER', 'حساب جديد');
            sendNotification(this.lastID, '🎉 مرحباً بك!', 'تم إنشاء حسابك بنجاح. استخدم كود WELCOME20 للحصول على خصم 20%', 'welcome');
            res.json({ success: true, message: 'تم إنشاء الحساب بنجاح' });
        });
    });
});

app.post('/api/verify-token', (req, res) => {
    const { token } = req.body;
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        db.get(`SELECT * FROM sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP`, [token], (err, session) => {
            if (err || !session) return res.json({ success: false, error: 'جلسة منتهية' });
            db.get(`SELECT id, name, email, phone, address, city, country, role, loyalty_points, tier FROM users WHERE id = ?`, [decoded.userId], (err2, user) => {
                if (!user) return res.json({ success: false, error: 'مستخدم غير موجود' });
                res.json({ success: true, user });
            });
        });
    } catch(e) { res.json({ success: false, error: 'توكن غير صالح' }); }
});

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { name, phone, address, city, country, password } = req.body;
    let query = `UPDATE users SET name = ?, phone = ?, address = ?, city = ?, country = ?`;
    let params = [name, phone, address, city, country];
    if (password) { const hash = await bcrypt.hash(password, 10); query += `, password = ?`; params.push(hash); }
    query += ` WHERE id = ?`; params.push(id);
    db.run(query, params, function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true, message: 'تم التحديث' }); });
});

// الأقسام
app.get('/api/categories', (req, res) => { db.all(`SELECT * FROM categories WHERE isActive = 1 ORDER BY sort_order`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.get('/api/categories/all', (req, res) => { db.all(`SELECT * FROM categories ORDER BY sort_order`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.post('/api/categories', (req, res) => { const { name, name_en, icon, parent_id, sort_order } = req.body; if (!name) return res.json({ success: false, error: 'اسم القسم مطلوب' }); const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-'); db.run(`INSERT INTO categories (name, name_en, slug, icon, parent_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)`, [name, name_en || '', slug, icon || '📁', parent_id || 0, sort_order || 0], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.put('/api/categories/:id', (req, res) => { const { id } = req.params; const { name, name_en, icon, parent_id, sort_order, isActive } = req.body; const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-'); db.run(`UPDATE categories SET name = ?, name_en = ?, slug = ?, icon = ?, parent_id = ?, sort_order = ?, isActive = ? WHERE id = ?`, [name, name_en, slug, icon, parent_id, sort_order, isActive, id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });
app.delete('/api/categories/:id', (req, res) => { const { id } = req.params; db.get(`SELECT * FROM categories WHERE id = ?`, [id], (err, cat) => { if (cat) db.run(`INSERT INTO trash (item_type, item_id, item_data) VALUES (?, ?, ?)`, ['category', id, JSON.stringify(cat)]); db.run(`DELETE FROM categories WHERE id = ?`, [id], function(err2) { if (err2) return res.json({ success: false, error: err2.message }); res.json({ success: true }); }); }); });

// المنتجات
app.get('/api/products', (req, res) => { const { category, search } = req.query; let query = `SELECT * FROM products WHERE isActive = 1`; let params = []; if (category && category !== 'all' && category !== 'undefined') { query += ` AND category_id = ?`; params.push(category); } if (search) { query += ` AND (name LIKE ? OR description LIKE ?)`; params.push(`%${search}%`, `%${search}%`); } query += ` ORDER BY id DESC`; db.all(query, params, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.get('/api/products/featured', (req, res) => { db.all(`SELECT * FROM products WHERE isActive = 1 AND isFeatured = 1 ORDER BY id DESC LIMIT 12`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.get('/api/products/best-sellers', (req, res) => { db.all(`SELECT * FROM products WHERE isActive = 1 ORDER BY sold_count DESC LIMIT 12`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.get('/api/products/:id', (req, res) => { const { id } = req.params; db.get(`SELECT * FROM products WHERE id = ?`, [id], (err, row) => { if (err) return res.status(500).json({ success: false, error: err.message }); if (row) db.run(`UPDATE products SET views_count = views_count + 1 WHERE id = ?`, [id]); db.all(`SELECT * FROM products WHERE category_id = ? AND id != ? LIMIT 4`, [row?.category_id, id], (err2, similar) => { res.json({ success: true, data: row, similar: similar || [] }); }); }); });
app.post('/api/products', upload.single('image'), (req, res) => { const { name, name_en, category_id, category_name, price, old_price, stock, colors, sizes, description, isFeatured } = req.body; if (!name || !price) return res.json({ success: false, error: 'الاسم والسعر مطلوبان' }); const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-'); const sku = 'SKU-' + Date.now() + '-' + Math.floor(Math.random() * 1000); const image = req.file ? `/assets/uploads/${req.file.filename}` : (req.body.image || ''); db.run(`INSERT INTO products (name, name_en, slug, sku, category_id, category_name, price, old_price, stock, image, colors, sizes, description, isFeatured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [name, name_en || '', slug, sku, category_id, category_name || '', price, old_price || 0, stock || 0, image, colors || '[]', sizes || '[]', description || '', isFeatured || 0], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.put('/api/products/:id', (req, res) => { const { id } = req.params; const { name, name_en, category_id, category_name, price, old_price, stock, image, colors, sizes, description, isActive, isFeatured } = req.body; const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-'); db.run(`UPDATE products SET name = ?, name_en = ?, slug = ?, category_id = ?, category_name = ?, price = ?, old_price = ?, stock = ?, image = ?, colors = ?, sizes = ?, description = ?, isActive = ?, isFeatured = ? WHERE id = ?`, [name, name_en, slug, category_id, category_name, price, old_price, stock, image, colors, sizes, description, isActive, isFeatured, id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });
app.delete('/api/products/:id', (req, res) => { const { id } = req.params; db.get(`SELECT * FROM products WHERE id = ?`, [id], (err, prod) => { if (prod) db.run(`INSERT INTO trash (item_type, item_id, item_data) VALUES (?, ?, ?)`, ['product', id, JSON.stringify(prod)]); db.run(`DELETE FROM products WHERE id = ?`, [id], function(err2) { if (err2) return res.json({ success: false, error: err2.message }); res.json({ success: true }); }); }); });

// السلة
app.get('/api/cart/:userId', (req, res) => { const { userId } = req.params; db.all(`SELECT * FROM cart WHERE user_id = ?`, [userId], (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); let subtotal = rows.reduce((s, i) => s + (i.price * i.quantity), 0); res.json({ success: true, data: rows, subtotal }); }); });
app.post('/api/cart', (req, res) => { const { user_id, product_id, product_name, product_image, price, quantity, color, size } = req.body; db.get(`SELECT * FROM cart WHERE user_id = ? AND product_id = ? AND color = ? AND size = ?`, [user_id, product_id, color || '', size || ''], (err, existing) => { if (err) return res.json({ success: false, error: err.message }); if (existing) { db.run(`UPDATE cart SET quantity = quantity + ? WHERE id = ?`, [quantity || 1, existing.id]); return res.json({ success: true, action: 'updated' }); } db.run(`INSERT INTO cart (user_id, product_id, product_name, product_image, price, quantity, color, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [user_id, product_id, product_name, product_image, price, quantity || 1, color || '', size || ''], function(err2) { if (err2) return res.json({ success: false, error: err2.message }); res.json({ success: true, action: 'added' }); }); }); });
app.put('/api/cart/:id', (req, res) => { const { id } = req.params; const { quantity } = req.body; db.run(`UPDATE cart SET quantity = ? WHERE id = ?`, [quantity, id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });
app.delete('/api/cart/:id', (req, res) => { const { id } = req.params; db.run(`DELETE FROM cart WHERE id = ?`, [id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });
app.delete('/api/cart/clear/:userId', (req, res) => { const { userId } = req.params; db.run(`DELETE FROM cart WHERE user_id = ?`, [userId], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });

// الطلبات
app.post('/api/orders', (req, res) => { const { user_id, user_name, user_email, user_phone, address, city, country, products, subtotal, shipping_cost, total } = req.body; const orderNumber = 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 10000); const signature = `توقيع العميل: ${user_name}`; const deliveryDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; db.run(`INSERT INTO orders (order_number, user_id, user_name, user_email, user_phone, address, city, country, products, subtotal, shipping_cost, total, signature, delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [orderNumber, user_id, user_name, user_email, user_phone, address, city, country, JSON.stringify(products), subtotal, shipping_cost, total, signature, deliveryDate], function(err) { if (err) return res.json({ success: false, error: err.message }); const points = Math.floor(total / 10); db.run(`UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?`, [points, user_id]); db.get(`SELECT loyalty_points FROM users WHERE id = ?`, [user_id], (err2, user) => { let tier = 'bronze'; if (user.loyalty_points >= 1000) tier = 'gold'; else if (user.loyalty_points >= 500) tier = 'silver'; db.run(`UPDATE users SET tier = ? WHERE id = ?`, [tier, user_id]); }); db.run(`DELETE FROM cart WHERE user_id = ?`, [user_id]); sendNotification(1, '📦 طلب جديد', `طلب رقم ${orderNumber} بقيمة ${total} ريال`, 'order'); logActivity(user_id, user_name, 'ORDER', `طلب جديد رقم ${orderNumber}`); res.json({ success: true, orderId: this.lastID, orderNumber }); }); });
app.get('/api/orders', (req, res) => { db.all(`SELECT * FROM orders ORDER BY date DESC`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.get('/api/orders/:id', (req, res) => { const { id } = req.params; db.get(`SELECT * FROM orders WHERE id = ?`, [id], (err, row) => { if (err) return res.status(500).json({ success: false, error: err.message }); QRCode.toDataURL(JSON.stringify({ orderNumber: row?.order_number, total: row?.total }), (err, qrCode) => { res.json({ success: true, data: row, qrCode: qrCode || null }); }); }); });
app.get('/api/orders/user/:userId', (req, res) => { const { userId } = req.params; db.all(`SELECT * FROM orders WHERE user_id = ? ORDER BY date DESC`, [userId], (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.put('/api/orders/:id/status', (req, res) => { const { id } = req.params; const { status, payment_status, shipping_status, tracking_number } = req.body; db.run(`UPDATE orders SET status = ?, payment_status = ?, shipping_status = ?, tracking_number = ? WHERE id = ?`, [status, payment_status, shipping_status, tracking_number, id], function(err) { if (err) return res.json({ success: false, error: err.message }); db.get(`SELECT user_id, order_number FROM orders WHERE id = ?`, [id], (err2, order) => { if (order?.user_id) sendNotification(order.user_id, '📋 تحديث الطلب', `تم تحديث حالة طلبك رقم ${order.order_number} إلى ${status}`, 'order'); }); res.json({ success: true }); }); });
app.get('/api/invoice/:orderId', (req, res) => { const { orderId } = req.params; db.get(`SELECT * FROM orders WHERE id = ? OR order_number = ?`, [orderId, orderId], (err, order) => { if (err || !order) return res.status(404).send('الفاتورة غير موجودة'); const products = JSON.parse(order.products || '[]'); const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>فاتورة ${order.order_number}</title><style>body{font-family:'Cairo',sans-serif;padding:30px}.invoice{max-width:800px;margin:auto;border:1px solid #ddd;border-radius:20px;padding:30px}.header{text-align:center;border-bottom:2px solid #b87333;padding-bottom:20px}.logo{font-size:2rem}.info{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:12px;border-bottom:1px solid #eee;text-align:right}.total{font-size:1.3rem;font-weight:bold;text-align:left}.footer{text-align:center;font-size:0.7rem;color:#666;margin-top:30px}.conditions{margin-top:20px;padding:15px;background:#f8fafc;border-radius:12px}button{background:#b87333;color:white;border:none;padding:10px 20px;border-radius:30px;cursor:pointer;width:100%}</style></head><body><div class="invoice"><div class="header"><div class="logo">🛍️</div><div class="title">الرعدي أونلاين</div><p>فاتورة شراء معتمدة</p></div><div class="info"><div><strong>رقم الفاتورة:</strong> ${order.order_number}</div><div><strong>التاريخ:</strong> ${new Date(order.date).toLocaleString('ar')}</div><div><strong>العميل:</strong> ${order.user_name}</div><div><strong>الهاتف:</strong> ${order.user_phone || '-'}</div><div><strong>العنوان:</strong> ${order.address || '-'}</div><div><strong>البلد:</strong> ${order.country === 'SA' ? 'السعودية (شحن داخلي)' : 'شحن دولي'}</div></div><table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${products.map(p => `<tr><td>${p.name}</td><td>${p.quantity}</td><td>${p.price} ريال</td><td>${p.price * p.quantity} ريال</td></tr>`).join('')}</tbody></table><div class="total">الإجمالي النهائي: ${order.total} ريال سعودي</div><div class="conditions"><strong>شروط الإرجاع والاستبدال:</strong><br>• يمكنك إرجاع المنتج خلال 14 يوماً من تاريخ الاستلام بشرط أن يكون بحالته الأصلية.<br>• يمكنك استبدال المنتج خلال 7 أيام من تاريخ الاستلام.<br>• يتم استرداد المبلغ خلال 5 أيام عمل بعد فحص المنتج.</div><div class="footer"><p>شكراً لتسوقك مع الرعدي أونلاين</p><p>للصيانة أو الاستفسار: واتساب 966500000000</p></div><button onclick="window.print()">🖨️ طباعة الفاتورة</button></div></body></html>`; res.send(html); }); });

// المراجعات والمفضلة
app.get('/api/reviews/product/:productId', (req, res) => { const { productId } = req.params; db.all(`SELECT * FROM reviews WHERE product_id = ? AND isApproved = 1 ORDER BY created_at DESC`, [productId], (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); db.get(`SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM reviews WHERE product_id = ? AND isApproved = 1`, [productId], (err2, stats) => { res.json({ success: true, data: rows, stats: { avg_rating: stats?.avg_rating || 0, total: stats?.total || 0 } }); }); }); });
app.post('/api/reviews', (req, res) => { const { product_id, user_id, user_name, rating, title, comment } = req.body; db.run(`INSERT INTO reviews (product_id, user_id, user_name, rating, title, comment, isApproved) VALUES (?, ?, ?, ?, ?, ?, ?)`, [product_id, user_id, user_name, rating, title || '', comment || '', 1], function(err) { if (err) return res.json({ success: false, error: err.message }); db.get(`SELECT AVG(rating) as avg_rating FROM reviews WHERE product_id = ? AND isApproved = 1`, [product_id], (err2, stats) => { db.run(`UPDATE products SET rating = ?, reviews_count = reviews_count + 1 WHERE id = ?`, [stats?.avg_rating || 5, product_id]); }); db.run(`UPDATE users SET loyalty_points = loyalty_points + 5 WHERE id = ?`, [user_id]); res.json({ success: true, id: this.lastID }); }); });
app.get('/api/wishlist/:userId', (req, res) => { const { userId } = req.params; db.all(`SELECT w.*, p.name, p.price, p.old_price, p.image, p.slug FROM wishlist w JOIN products p ON w.product_id = p.id WHERE w.user_id = ?`, [userId], (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.post('/api/wishlist', (req, res) => { const { user_id, product_id } = req.body; db.get(`SELECT * FROM wishlist WHERE user_id = ? AND product_id = ?`, [user_id, product_id], (err, existing) => { if (err) return res.json({ success: false, error: err.message }); if (existing) { db.run(`DELETE FROM wishlist WHERE id = ?`, [existing.id]); return res.json({ success: true, action: 'removed' }); } db.run(`INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)`, [user_id, product_id], function(err2) { if (err2) return res.json({ success: false, error: err2.message }); res.json({ success: true, action: 'added', id: this.lastID }); }); }); });

// كوبونات
app.get('/api/coupons', (req, res) => { db.all(`SELECT * FROM coupons ORDER BY id DESC`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.post('/api/coupons/validate', (req, res) => { const { code, subtotal } = req.body; db.get(`SELECT * FROM coupons WHERE code = ? AND isActive = 1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`, [code.toUpperCase()], (err, coupon) => { if (err || !coupon) return res.json({ success: false, error: 'الكوبون غير صالح' }); if (coupon.min_order && subtotal < coupon.min_order) return res.json({ success: false, error: `الحد الأدنى ${coupon.min_order} ريال` }); if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return res.json({ success: false, error: 'تم استخدام هذا الكوبون максимальный عدد مرات' }); let discount = coupon.discount_type === 'percentage' ? (subtotal * coupon.discount_value) / 100 : coupon.discount_value; if (coupon.max_discount && discount > coupon.max_discount) discount = coupon.max_discount; res.json({ success: true, discount: Math.min(discount, subtotal), final_total: subtotal - Math.min(discount, subtotal) }); }); });
app.post('/api/coupons', (req, res) => { const { code, description, discount_type, discount_value, min_order, max_discount, max_uses, expires_at } = req.body; db.run(`INSERT INTO coupons (code, description, discount_type, discount_value, min_order, max_discount, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [code.toUpperCase(), description || '', discount_type, discount_value, min_order || 0, max_discount || 0, max_uses || 0, expires_at || null], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.delete('/api/coupons/:id', (req, res) => { const { id } = req.params; db.run(`DELETE FROM coupons WHERE id = ?`, [id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });

// الإحصائيات
app.get('/api/stats', (req, res) => { const stats = {}; db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'client'`, (err, row) => { stats.clients = row?.count || 0; }); db.get(`SELECT COUNT(*) as count FROM products WHERE isActive = 1`, (err, row) => { stats.products = row?.count || 0; }); db.get(`SELECT COUNT(*) as count FROM orders`, (err, row) => { stats.orders = row?.count || 0; }); db.get(`SELECT COUNT(*) as count FROM categories`, (err, row) => { stats.categories = row?.count || 0; }); db.get(`SELECT SUM(total) as total FROM orders WHERE status != 'cancelled'`, (err, row) => { stats.revenue = row?.total || 0; }); db.get(`SELECT SUM(total) as total FROM orders WHERE date >= date('now', '-30 days')`, (err, row) => { stats.monthlyRevenue = row?.total || 0; }); db.get(`SELECT SUM(total) as total FROM orders WHERE date = date('now')`, (err, row) => { stats.todayRevenue = row?.total || 0; }); db.get(`SELECT COUNT(*) as count FROM products WHERE stock < 5`, (err, row) => { stats.lowStock = row?.count || 0; }); db.get(`SELECT COUNT(*) as count FROM orders WHERE status = 'pending'`, (err, row) => { stats.pendingOrders = row?.count || 0; }); setTimeout(() => res.json({ success: true, stats }), 200); });
app.get('/api/stats/sales', (req, res) => { db.all(`SELECT date(date) as day, COUNT(*) as count, SUM(total) as total FROM orders WHERE date >= date('now', '-30 days') GROUP BY date(date) ORDER BY day`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.get('/api/stats/top-products', (req, res) => { db.all(`SELECT id, name, price, sold_count, rating, image FROM products ORDER BY sold_count DESC LIMIT 10`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });

// سلة المحذوفات
app.get('/api/trash', (req, res) => { db.all(`SELECT * FROM trash ORDER BY deleted_at DESC`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.post('/api/trash/restore/:id', (req, res) => { const { id } = req.params; db.get(`SELECT * FROM trash WHERE id = ?`, [id], (err, item) => { if (!item) return res.json({ success: false, error: 'العنصر غير موجود' }); const data = JSON.parse(item.item_data); if (item.item_type === 'product') { db.run(`INSERT INTO products (name, name_en, slug, sku, category_id, category_name, price, old_price, cost_price, stock, min_stock, weight, dimensions, image, images, colors, sizes, tags, brand, description, specifications, isActive, isFeatured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [data.name, data.name_en, data.slug, data.sku, data.category_id, data.category_name, data.price, data.old_price, data.cost_price, data.stock, data.min_stock, data.weight, data.dimensions, data.image, data.images, data.colors, data.sizes, data.tags, data.brand, data.description, data.specifications, 1, data.isFeatured || 0], function(err2) { if (err2) return res.json({ success: false, error: err2.message }); db.run(`DELETE FROM trash WHERE id = ?`, [id]); res.json({ success: true }); }); } else if (item.item_type === 'category') { db.run(`INSERT INTO categories (name, name_en, slug, icon, image, parent_id, level, sort_order, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [data.name, data.name_en, data.slug, data.icon, data.image, data.parent_id, data.level, data.sort_order, 1], function(err2) { if (err2) return res.json({ success: false, error: err2.message }); db.run(`DELETE FROM trash WHERE id = ?`, [id]); res.json({ success: true }); }); } else { res.json({ success: false, error: 'نوع غير معروف' }); } }); });
app.delete('/api/trash/:id', (req, res) => { const { id } = req.params; db.run(`DELETE FROM trash WHERE id = ?`, [id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });

// الدردشة والإشعارات والمعروضات والصوتيات
app.get('/api/chat/messages', (req, res) => { db.all(`SELECT * FROM chat_messages ORDER BY created_at ASC LIMIT 100`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.post('/api/chat/messages', (req, res) => { const { user_id, user_name, message } = req.body; db.run(`INSERT INTO chat_messages (user_id, user_name, message) VALUES (?, ?, ?)`, [user_id, user_name, message], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.get('/api/notifications/:userId', (req, res) => { const { userId } = req.params; db.all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [userId], (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); db.get(`SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0`, [userId], (err2, count) => { res.json({ success: true, data: rows, unread: count?.unread || 0 }); }); }); });
app.put('/api/notifications/:id/read', (req, res) => { const { id } = req.params; db.run(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });
app.get('/api/banners', (req, res) => { db.all(`SELECT * FROM banners WHERE isActive = 1 ORDER BY sort_order`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.post('/api/banners', upload.single('image'), (req, res) => { const { title, link, position, sort_order } = req.body; const image = req.file ? `/assets/uploads/${req.file.filename}` : (req.body.image || ''); db.run(`INSERT INTO banners (title, image, link, position, sort_order) VALUES (?, ?, ?, ?, ?)`, [title || '', image, link || '', position || 'hero', sort_order || 0], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.delete('/api/banners/:id', (req, res) => { const { id } = req.params; db.run(`DELETE FROM banners WHERE id = ?`, [id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });
app.get('/api/sounds', (req, res) => { db.all(`SELECT * FROM sounds WHERE isActive = 1`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.post('/api/sounds', uploadSound.single('file'), (req, res) => { const { name, type } = req.body; const filename = req.file ? req.file.filename : ''; const url = req.file ? `/assets/sounds/${filename}` : ''; db.run(`INSERT INTO sounds (name, type, filename, url) VALUES (?, ?, ?, ?)`, [name, type, filename, url], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true, id: this.lastID, url }); }); });
app.put('/api/sounds/:id', (req, res) => { const { id } = req.params; const { isActive } = req.body; db.run(`UPDATE sounds SET isActive = ? WHERE id = ?`, [isActive, id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });

// الإعدادات والمستخدمين والسجلات
app.get('/api/settings', (req, res) => { db.all(`SELECT * FROM settings`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); const settings = {}; rows.forEach(row => { settings[row.key] = row.value; }); res.json({ success: true, data: settings }); }); });
app.put('/api/settings/:key', (req, res) => { const { key } = req.params; const { value } = req.body; db.run(`UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`, [value, key], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });
app.get('/api/users', (req, res) => { db.all(`SELECT id, name, email, phone, address, city, country, role, loyalty_points, tier, created_at FROM users`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.put('/api/users/:id/role', (req, res) => { const { id } = req.params; const { role } = req.body; if (role === 'admin') return res.json({ success: false, error: 'لا يمكن تعيين مدير جديد' }); db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });
app.delete('/api/users/:id', (req, res) => { const { id } = req.params; db.run(`DELETE FROM users WHERE id = ? AND role != 'admin'`, [id], function(err) { if (err) return res.json({ success: false, error: err.message }); res.json({ success: true }); }); });
app.get('/api/logs/errors', (req, res) => { db.all(`SELECT * FROM error_logs ORDER BY timestamp DESC LIMIT 100`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });
app.get('/api/logs/activities', (req, res) => { db.all(`SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 100`, (err, rows) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, data: rows }); }); });

// الصفحات
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الرعدي أونلاين يعمل على المنفذ ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`👑 المدير: admin@system.com / admin123`);
    console.log(`✅ جميع الجداول جاهزة (19 جدولاً)`);
    console.log(`✅ النظام متكامل بالكامل`);
});
