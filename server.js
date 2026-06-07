const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== إعدادات السيرفر المتقدمة ====================
app.use(session({
    secret: 'raadi-ultimate-global-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== قاعدة البيانات المتطورة ====================
const db = new sqlite3.Database('./raadi.db');
db.serialize(() => {
    // ======== الجداول الأساسية ========
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name_ar TEXT, name_en TEXT, icon TEXT, createdAt TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name_ar TEXT, name_en TEXT, category TEXT, price REAL, oldPrice REAL, discount INTEGER, color TEXT, features_ar TEXT, features_en TEXT, stock INTEGER, image TEXT, rating REAL DEFAULT 0, ratingCount INTEGER DEFAULT 0, views INTEGER DEFAULT 0, soldCount INTEGER DEFAULT 0, createdAt TEXT, updatedAt TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS product_ratings (id INTEGER PRIMARY KEY AUTOINCREMENT, productId INTEGER, userId INTEGER, rating INTEGER, review_ar TEXT, review_en TEXT, createdAt TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'user', phone TEXT, address TEXT, avatar TEXT, wishlist TEXT, loyaltyPoints INTEGER DEFAULT 0, preferredLang TEXT DEFAULT 'ar', preferredCurrency TEXT DEFAULT 'SAR', createdAt TEXT, lastLogin TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, orderNumber TEXT UNIQUE, customer TEXT, email TEXT, phone TEXT, address TEXT, city TEXT, country TEXT, items TEXT, subtotal REAL, discount INTEGER, discountAmount REAL, shipping REAL, tax REAL, total REAL, currency TEXT, paymentMethod TEXT, status TEXT, trackingNumber TEXT, date TEXT, dateFormatted TEXT, notes TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, sender TEXT, text_ar TEXT, text_en TEXT, isAdmin INTEGER DEFAULT 0, isRead INTEGER DEFAULT 0, timestamp TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, value INTEGER, minOrder REAL, expiresAt TEXT, usageLimit INTEGER, usedCount INTEGER DEFAULT 0, createdAt TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_ar TEXT, value_en TEXT, updatedAt TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, action TEXT, details TEXT, ip TEXT, createdAt TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS abandoned_carts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, items TEXT, total REAL, createdAt TEXT, notified INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS reserved_stock (id INTEGER PRIMARY KEY AUTOINCREMENT, productId INTEGER, quantity INTEGER, sessionId TEXT, expiresAt TEXT)`);

    // ======== البيانات الأولية ========
    db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
        if (row && row.count === 0) {
            const cats = [
                ['هواتف', 'Phones', 'fa-mobile-alt'],
                ['عطور', 'Perfumes', 'fa-leaf'],
                ['إكسسوارات', 'Accessories', 'fa-headphones'],
                ['إلكترونيات', 'Electronics', 'fa-microchip'],
                ['ملابس', 'Clothing', 'fa-tshirt'],
                ['أحذية', 'Shoes', 'fa-shoe-prints']
            ];
            cats.forEach(c => db.run("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", [c[0], c[1], c[2], new Date().toISOString()]));
        }
    });

    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO users (name, email, password, role, loyaltyPoints, createdAt) VALUES (?, ?, ?, ?, ?, ?)", 
                ['المدير العام', 'admin@raadi.com', bcrypt.hashSync('admin123', 10), 'admin', 0, new Date().toISOString()]);
        }
    });

    db.get("SELECT COUNT(*) as count FROM settings", (err, row) => {
        if (row && row.count === 0) {
            const defaultSettings = [
                ['siteName', 'الرعدي أونلاين', 'Raadi Online'],
                ['domesticShipping', '15', '15'],
                ['internationalShipping', '50', '50'],
                ['taxRate', '0', '0'],
                ['returnPolicy', 'يمكن استرجاع المنتج خلال 14 يوماً', 'Return within 14 days'],
                ['whatsappNumber', '966500000000', '966500000000'],
                ['maintenanceMode', '0', '0'],
                ['flashSaleEnds', '', '']
            ];
            defaultSettings.forEach(s => db.run("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", [s[0], s[1], s[2], new Date().toISOString()]));
        }
    });
});

// ==================== دوال مساعدة ====================
const query = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
const get = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
const run = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function(err) { err ? rej(err) : res({ lastID: this.lastID }); }));

// إضافة سجل النشاطات
async function addAuditLog(userId, action, details, ip) {
    await run("INSERT INTO audit_logs (userId, action, details, ip, createdAt) VALUES (?, ?, ?, ?, ?)", 
        [userId, action, details, ip || '', new Date().toISOString()]);
}

// ==================== API المسارات ====================

// الأقسام
app.get('/api/categories', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const cats = await query("SELECT name_ar, name_en, icon FROM categories");
        res.json(cats.map(c => ({ name: lang === 'ar' ? c.name_ar : c.name_en, icon: c.icon })));
    } catch { res.status(500).json([]); }
});

// المنتجات مع دعم اللغة
app.get('/api/products', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const products = await query("SELECT * FROM products ORDER BY id DESC");
        const mapped = products.map(p => ({
            id: p.id,
            name: lang === 'ar' ? p.name_ar : p.name_en,
            category: p.category,
            price: p.price,
            oldPrice: p.oldPrice,
            discount: p.discount,
            color: p.color,
            features: lang === 'ar' ? p.features_ar : p.features_en,
            stock: p.stock,
            image: p.image,
            rating: p.rating,
            ratingCount: p.ratingCount,
            soldCount: p.soldCount
        }));
        res.json(mapped);
    } catch { res.status(500).json([]); }
});

// إضافة منتج (للمدير)
app.post('/api/products', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const { name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image } = req.body;
    try {
        await run(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt, updatedAt) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name_ar, name_en, category, price, oldPrice || 0, discount || 0, color || '', features_ar || '', features_en || '', stock || 0, image || '', new Date().toISOString(), new Date().toISOString()]);
        addAuditLog(req.session.userId, 'ADD_PRODUCT', `Added product: ${name_ar}`, req.ip);
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'Error adding product' }); }
});

app.delete('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    try {
        await run("DELETE FROM products WHERE id = ?", [req.params.id]);
        addAuditLog(req.session.userId, 'DELETE_PRODUCT', `Deleted product ID: ${req.params.id}`, req.ip);
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'Error deleting product' }); }
});

// تقييم المنتج
app.post('/api/products/:id/rate', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
    const { rating, review_ar, review_en } = req.body;
    try {
        await run("INSERT INTO product_ratings (productId, userId, rating, review_ar, review_en, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
            [req.params.id, req.session.userId, rating, review_ar || '', review_en || '', new Date().toISOString()]);
        const ratings = await query("SELECT rating FROM product_ratings WHERE productId = ?", [req.params.id]);
        const avg = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
        await run("UPDATE products SET rating = ?, ratingCount = ? WHERE id = ?", [avg, ratings.length, req.params.id]);
        addAuditLog(req.session.userId, 'RATE_PRODUCT', `Rated product ID: ${req.params.id} with ${rating} stars`, req.ip);
        res.json({ success: true, newRating: avg });
    } catch { res.status(500).json({ error: 'Error submitting rating' }); }
});

// إضافة إلى قائمة الأمنيات
app.post('/api/wishlist/add', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
    const { productId } = req.body;
    try {
        const user = await get("SELECT wishlist FROM users WHERE id = ?", [req.session.userId]);
        let wishlist = user.wishlist ? JSON.parse(user.wishlist) : [];
        if (!wishlist.includes(productId)) wishlist.push(productId);
        await run("UPDATE users SET wishlist = ? WHERE id = ?", [JSON.stringify(wishlist), req.session.userId]);
        addAuditLog(req.session.userId, 'ADD_WISHLIST', `Added product ${productId} to wishlist`, req.ip);
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'Error adding to wishlist' }); }
});

// حجز المخزون (Timer)
app.post('/api/reserve-stock', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
    const { items } = req.body;
    const sessionId = req.session.id;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    try {
        for (const item of items) {
            await run("INSERT INTO reserved_stock (productId, quantity, sessionId, expiresAt) VALUES (?, ?, ?, ?)",
                [item.id, item.quantity, sessionId, expiresAt]);
        }
        res.json({ success: true, expiresAt });
    } catch { res.status(500).json({ error: 'Error reserving stock' }); }
});

// إرسال الطلب مع إشعار واتساب
app.post('/api/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
    const { customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency, notes } = req.body;
    const orderNumber = 'RAD-' + Date.now();
    try {
        await run(`INSERT INTO orders (userId, orderNumber, customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency, status, date, dateFormatted, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, orderNumber, customer, email, phone, address, country, JSON.stringify(items), subtotal, discount, discountAmount, shipping, total, currency || 'SAR', 'pending', new Date().toISOString(), new Date().toLocaleDateString('ar-EG'), notes || '']);
        
        // تحديث المخزون وإزالة الحجز
        for (const item of items) {
            await run("DELETE FROM reserved_stock WHERE productId = ? AND sessionId = ?", [item.id, req.session.id]);
            const product = await get("SELECT stock FROM products WHERE id = ?", [item.id]);
            if (product) await run("UPDATE products SET stock = ?, soldCount = COALESCE(soldCount, 0) + ? WHERE id = ?", [product.stock - item.quantity, item.quantity, item.id]);
        }
        
        // إضافة نقاط ولاء (كل 100 ريال = 5 نقاط)
        const pointsEarned = Math.floor(total / 100) * 5;
        await run("UPDATE users SET loyaltyPoints = COALESCE(loyaltyPoints, 0) + ? WHERE id = ?", [pointsEarned, req.session.userId]);
        
        addAuditLog(req.session.userId, 'PLACE_ORDER', `Order ${orderNumber} placed for ${total} ${currency}`, req.ip);
        
        // إرسال إشعار واتساب للمدير
        const settings = await get("SELECT value_ar FROM settings WHERE key = 'whatsappNumber'");
        const whatsappNumber = settings?.value_ar || '966500000000';
        const message = `🦅 طلب جديد في الرعدي أونلاين\n📋 رقم: ${orderNumber}\n👤 العميل: ${customer}\n📞 ${phone}\n📍 ${address}\n💰 الإجمالي: ${total} ${currency}\n🔗 https://raadi-store.com/orders/${orderNumber}`;
        try {
            await axios.get(`https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${encodeURIComponent(message)}`);
        } catch (waErr) { console.log("WhatsApp notification failed"); }
        
        res.json({ success: true, orderNumber });
    } catch (err) { res.status(500).json({ error: 'Error placing order' }); }
});

// الحصول على طلبات العميل
app.get('/api/my-orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        const orders = await query("SELECT * FROM orders WHERE userId = ? ORDER BY id DESC", [req.session.userId]);
        orders.forEach(o => o.items = JSON.parse(o.items));
        res.json(orders);
    } catch { res.status(500).json([]); }
});

// إحصائيات للمدير
app.get('/api/stats', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    try {
        const totalUsers = await get("SELECT COUNT(*) as count FROM users WHERE role != 'admin'");
        const totalProducts = await get("SELECT COUNT(*) as count FROM products");
        const totalOrders = await get("SELECT COUNT(*) as count FROM orders");
        const totalRevenue = await get("SELECT SUM(total) as sum FROM orders");
        const lowStock = await get("SELECT COUNT(*) as count FROM products WHERE stock < 5");
        const today = new Date().toISOString().split('T')[0];
        const todayRevenue = await get("SELECT SUM(total) as sum FROM orders WHERE date LIKE ?", [today + '%']);
        const pendingOrders = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
        res.json({
            totalUsers: totalUsers.count,
            totalProducts: totalProducts.count,
            totalOrders: totalOrders.count,
            totalRevenue: totalRevenue.sum || 0,
            todayRevenue: todayRevenue.sum || 0,
            lowStock: lowStock.count,
            pendingOrders: pendingOrders.count
        });
    } catch { res.status(500).json({}); }
});

// إعدادات المتجر (دعم اللغة والعملة)
app.get('/api/settings', async (req, res) => {
    try {
        const rows = await query("SELECT key, value_ar, value_en FROM settings");
        const settings = {};
        rows.forEach(r => { settings[r.key] = { ar: r.value_ar, en: r.value_en }; });
        res.json(settings);
    } catch { res.status(500).json({}); }
});

app.post('/api/settings', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const { key, value_ar, value_en } = req.body;
    try {
        await run("UPDATE settings SET value_ar = ?, value_en = ?, updatedAt = ? WHERE key = ?", [value_ar, value_en, new Date().toISOString(), key]);
        addAuditLog(req.session.userId, 'UPDATE_SETTINGS', `Updated setting: ${key}`, req.ip);
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'Error saving settings' }); }
});

// وضع الطوارئ (Maintenance Mode)
app.get('/api/maintenance-status', async (req, res) => {
    const mode = await get("SELECT value_ar FROM settings WHERE key = 'maintenanceMode'");
    res.json({ maintenance: mode?.value_ar === '1' });
});

// إشعارات للمدير عن الطلبات الجديدة
app.get('/api/pending-orders-count', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const count = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
    res.json({ count: count.count });
});

// تحديث حالة الطلب
app.put('/api/orders/:id/status', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const { status, trackingNumber } = req.body;
    try {
        await run("UPDATE orders SET status = ?, trackingNumber = ? WHERE id = ?", [status, trackingNumber || null, req.params.id]);
        addAuditLog(req.session.userId, 'UPDATE_ORDER', `Order ${req.params.id} status changed to ${status}`, req.ip);
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'Error updating order' }); }
});

// المصادقة
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await get("SELECT * FROM users WHERE email = ?", [email]);
        if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
        await run("UPDATE users SET lastLogin = ? WHERE id = ?", [new Date().toISOString(), user.id]);
        req.session.userId = user.id;
        req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, loyaltyPoints: user.loyaltyPoints, preferredLang: user.preferredLang || 'ar', preferredCurrency: user.preferredCurrency || 'SAR' };
        addAuditLog(user.id, 'LOGIN', 'User logged in', req.ip);
        res.json({ success: true, user: req.session.user });
    } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/register', async (req, res) => {
    const { name, email, password, phone, address } = req.body;
    try {
        const existing = await get("SELECT id FROM users WHERE email = ?", [email]);
        if (existing) return res.status(400).json({ error: 'Email already registered' });
        const hashed = bcrypt.hashSync(password, 10);
        await run("INSERT INTO users (name, email, password, phone, address, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
            [name, email, hashed, phone || '', address || '', new Date().toISOString()]);
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'Registration error' }); }
});

app.post('/api/logout', (req, res) => {
    if (req.session.userId) addAuditLog(req.session.userId, 'LOGOUT', 'User logged out', req.ip);
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', async (req, res) => {
    if (!req.session.userId) return res.status(401);
    const user = await get("SELECT id, name, email, role, phone, address, avatar, loyaltyPoints, preferredLang, preferredCurrency FROM users WHERE id = ?", [req.session.userId]);
    res.json(user);
});

app.post('/api/update-profile', async (req, res) => {
    if (!req.session.userId) return res.status(401);
    const { name, phone, address, avatar, preferredLang, preferredCurrency } = req.body;
    await run("UPDATE users SET name = ?, phone = ?, address = ?, avatar = ?, preferredLang = ?, preferredCurrency = ? WHERE id = ?",
        [name, phone || '', address || '', avatar || '', preferredLang || 'ar', preferredCurrency || 'SAR', req.session.userId]);
    addAuditLog(req.session.userId, 'UPDATE_PROFILE', 'Updated profile', req.ip);
    res.json({ success: true });
});

// الصفحات
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// تنظيف الحجوزات المنتهية (كل دقيقة)
setInterval(async () => {
    await run("DELETE FROM reserved_stock WHERE expiresAt < datetime('now')");
}, 60 * 1000);

app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🦅 الرعدي أونلاين | المتجر العالمي الأسطوري`);
    console.log(`🚀 يعمل على: http://localhost:${PORT}`);
    console.log(`👑 المدير: admin@raadi.com / admin123`);
    console.log(`🌐 دعم اللغات: العربية / English`);
    console.log(`💱 دعم العملات: SAR / USD`);
    console.log(`========================================`);
});
