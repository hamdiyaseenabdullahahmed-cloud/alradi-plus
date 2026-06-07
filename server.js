const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(session({
    secret: 'raadi-ultimate-super-secret-2026-enterprise',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = process.env.DB_PATH || path.join(__dirname, 'raadi.db');
const db = new sqlite3.Database(dbPath);

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

const createTables = async () => {
    try {
        await runQuery(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ar TEXT NOT NULL,
            name_en TEXT NOT NULL,
            icon TEXT,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ar TEXT NOT NULL,
            name_en TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            oldPrice REAL,
            discount INTEGER DEFAULT 0,
            color TEXT,
            features_ar TEXT,
            features_en TEXT,
            stock INTEGER DEFAULT 0,
            image TEXT,
            rating REAL DEFAULT 0,
            ratingCount INTEGER DEFAULT 0,
            soldCount INTEGER DEFAULT 0,
            createdAt TEXT,
            updatedAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS product_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            productId INTEGER,
            userId INTEGER,
            rating INTEGER,
            review_ar TEXT,
            review_en TEXT,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            phone TEXT,
            address TEXT,
            wishlist TEXT,
            loyaltyPoints INTEGER DEFAULT 0,
            createdAt TEXT,
            lastLogin TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            orderNumber TEXT UNIQUE,
            customer TEXT NOT NULL,
            email TEXT,
            phone TEXT NOT NULL,
            address TEXT NOT NULL,
            country TEXT NOT NULL,
            items TEXT NOT NULL,
            subtotal REAL,
            discount INTEGER DEFAULT 0,
            discountAmount REAL DEFAULT 0,
            shipping REAL DEFAULT 0,
            total REAL NOT NULL,
            currency TEXT DEFAULT 'SAR',
            status TEXT DEFAULT 'pending',
            date TEXT NOT NULL,
            dateFormatted TEXT NOT NULL
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            sender TEXT NOT NULL,
            text_ar TEXT,
            text_en TEXT,
            isAdmin INTEGER DEFAULT 0,
            timestamp TEXT,
            date TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS coupons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            value INTEGER NOT NULL,
            minOrder REAL DEFAULT 0,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_ar TEXT,
            value_en TEXT,
            updatedAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS reserved_stock (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            productId INTEGER,
            quantity INTEGER,
            sessionId TEXT,
            expiresAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            action TEXT,
            details TEXT,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ar TEXT NOT NULL,
            name_en TEXT NOT NULL,
            createdAt TEXT
        )`);

        console.log('✅ جميع الجداول تم إنشاؤها بنجاح');

        const catCount = await getQuery("SELECT COUNT(*) as count FROM categories");
        if (catCount.count === 0) {
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", ['هواتف', 'Phones', 'fa-mobile-alt', new Date().toISOString()]);
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", ['عطور', 'Perfumes', 'fa-leaf', new Date().toISOString()]);
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", ['إكسسوارات', 'Accessories', 'fa-headphones', new Date().toISOString()]);
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", ['إلكترونيات', 'Electronics', 'fa-microchip', new Date().toISOString()]);
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", ['ملابس', 'Clothing', 'fa-tshirt', new Date().toISOString()]);
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", ['أحذية', 'Shoes', 'fa-shoe-prints', new Date().toISOString()]);
            console.log('✅ تم إضافة الأقسام الافتراضية');
        }

        const adminCount = await getQuery("SELECT COUNT(*) as count FROM users WHERE email = 'admin@raadi.com'");
        if (adminCount.count === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await runQuery("INSERT INTO users (name, email, password, role, createdAt) VALUES (?, ?, ?, ?, ?)", ['المدير العام', 'admin@raadi.com', hashedPassword, 'admin', new Date().toISOString()]);
            console.log('✅ تم إضافة حساب المدير');
        }

        const prodCount = await getQuery("SELECT COUNT(*) as count FROM products");
        if (prodCount.count === 0) {
            await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                ['هاتف الرعدي برو X', 'Raadi Phone Pro X', 'هواتف', 2999, 3499, 15, 'أسود تيتانيوم', 'كاميرا 200 ميجابكسل، شاشة 6.8 بوصة، معالج فائق', '200MP Camera, 6.8" Screen, Ultra Processor', 10, 'https://picsum.photos/id/0/300/300', new Date().toISOString()]);
            await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                ['سامسونج جالكسي S24 الترا', 'Samsung Galaxy S24 Ultra', 'هواتف', 4940, 5200, 12, 'رمادي تيتانيوم', 'كاميرا 200 ميجابكسل، قلم S-Pen، سعة 512 جيجا', '200MP Camera, S-Pen, 512GB', 7, 'https://picsum.photos/id/1/300/300', new Date().toISOString()]);
            await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                ['سماعة أبل إيربودز برو', 'Apple AirPods Pro', 'إكسسوارات', 899, 1099, 18, 'أبيض ناصع', 'تقنية عزل الضوضاء، صوت محيطي، مقاومة للماء', 'Noise Cancellation, Spatial Audio, Water Resistant', 15, 'https://picsum.photos/id/3/300/300', new Date().toISOString()]);
            await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                ['عطر بلو دي شانيل الأصلي', 'Bleu de Chanel', 'عطور', 4140, 4600, 10, 'شفاف كحلي غامق', 'رائحة خشبية فاخرة، تدوم طويلاً، تركيز عالي', 'Luxury woody scent, long lasting', 5, 'https://picsum.photos/id/2/300/300', new Date().toISOString()]);
            console.log('✅ تم إضافة منتجات افتراضية');
        }

        const coupCount = await getQuery("SELECT COUNT(*) as count FROM coupons");
        if (coupCount.count === 0) {
            await runQuery("INSERT INTO coupons (code, value, minOrder, createdAt) VALUES (?, ?, ?, ?)", ['WELCOME20', 20, 0, new Date().toISOString()]);
            await runQuery("INSERT INTO coupons (code, value, minOrder, createdAt) VALUES (?, ?, ?, ?)", ['SUMMER70', 70, 300, new Date().toISOString()]);
            console.log('✅ تم إضافة كوبونات افتراضية');
        }

        const setCount = await getQuery("SELECT COUNT(*) as count FROM settings");
        if (setCount.count === 0) {
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['siteName', 'الرعدي أونلاين', 'Raadi Online', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['domesticShipping', '15', '15', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['internationalShipping', '50', '50', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['whatsappNumber', '966500000000', '966500000000', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['returnPolicy', 'يمكن استرجاع المنتج خلال 14 يوماً في حالة وجود عيب صناعي. يتم الاستبدال خلال 7 أيام.', 'Return within 14 days if manufacturing defect. Exchange within 7 days.', new Date().toISOString()]);
            console.log('✅ تم إضافة الإعدادات الافتراضية');
        }

    } catch (error) {
        console.error('❌ خطأ في إنشاء الجداول:', error.message);
    }
};

createTables();

setInterval(async () => {
    await runQuery("DELETE FROM reserved_stock WHERE expiresAt < datetime('now')");
}, 60 * 1000);

// ==================== مسارات API العامة ====================

// الأقسام
app.get('/api/categories', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const cats = await allQuery("SELECT name_ar, name_en FROM categories");
        const formatted = cats.map(c => ({ name: lang === 'ar' ? c.name_ar : c.name_en }));
        res.json(formatted);
    } catch (error) {
        console.error('خطأ في جلب الأقسام:', error);
        res.status(500).json([]);
    }
});

app.post('/api/categories', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const { name_ar, name_en } = req.body;
    try {
        await runQuery("INSERT INTO categories (name_ar, name_en, createdAt) VALUES (?, ?, ?)", [name_ar, name_en, new Date().toISOString()]);
        await addAuditLog(req.session.userId, 'ADD_CATEGORY', `أضاف قسم جديد: ${name_ar}`);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إضافة القسم:', error);
        res.status(500).json({ error: 'حدث خطأ في إضافة القسم' });
    }
});

app.delete('/api/categories/:name', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        await runQuery("DELETE FROM categories WHERE name_ar = ? OR name_en = ?", [req.params.name, req.params.name]);
        await runQuery("DELETE FROM products WHERE category = ?", [req.params.name]);
        await addAuditLog(req.session.userId, 'DELETE_CATEGORY', `حذف قسم: ${req.params.name}`);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في حذف القسم:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// المنتجات
app.get('/api/products', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const products = await allQuery("SELECT * FROM products ORDER BY id DESC");
        const formatted = products.map(p => ({
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
            rating: p.rating || 0,
            ratingCount: p.ratingCount || 0,
            soldCount: p.soldCount || 0
        }));
        res.json(formatted);
    } catch (error) {
        console.error('خطأ في جلب المنتجات:', error);
        res.status(500).json([]);
    }
});

app.post('/api/products', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const { name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image } = req.body;
    try {
        const result = await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name_ar, name_en, category, price, oldPrice || 0, discount || 0, color || '', features_ar || '', features_en || '', stock || 0, image || 'https://picsum.photos/id/20/300/300', new Date().toISOString(), new Date().toISOString()]);
        await addAuditLog(req.session.userId, 'ADD_PRODUCT', `أضاف منتج جديد: ${name_ar}`);
        res.json({ success: true, productId: result.lastID });
    } catch (error) {
        console.error('خطأ في إضافة المنتج:', error);
        res.status(500).json({ error: 'حدث خطأ في إضافة المنتج' });
    }
});

app.put('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = req.params.id;
    const updates = req.body;
    try {
        const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updates), new Date().toISOString(), id];
        await runQuery(`UPDATE products SET ${setClause}, updatedAt = ? WHERE id = ?`, values);
        await addAuditLog(req.session.userId, 'UPDATE_PRODUCT', `حدث منتج رقم ${id}`);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في تحديث المنتج:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        await runQuery("DELETE FROM products WHERE id = ?", [req.params.id]);
        await runQuery("DELETE FROM product_ratings WHERE productId = ?", [req.params.id]);
        await addAuditLog(req.session.userId, 'DELETE_PRODUCT', `حذف منتج رقم ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في حذف المنتج:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// تقييم المنتجات
app.post('/api/products/:id/rate', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'سجل دخولك أولاً' });
    }
    const { rating, review_ar, review_en } = req.body;
    try {
        await runQuery("INSERT INTO product_ratings (productId, userId, rating, review_ar, review_en, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
            [req.params.id, req.session.userId, rating, review_ar || '', review_en || '', new Date().toISOString()]);
        const ratings = await allQuery("SELECT rating FROM product_ratings WHERE productId = ?", [req.params.id]);
        const avg = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
        await runQuery("UPDATE products SET rating = ?, ratingCount = ? WHERE id = ?", [avg, ratings.length, req.params.id]);
        await addAuditLog(req.session.userId, 'RATE_PRODUCT', `قيم منتج ${req.params.id} بـ ${rating} نجوم`);
        res.json({ success: true, newRating: avg });
    } catch (error) {
        console.error('خطأ في التقييم:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.get('/api/products/:id/ratings', async (req, res) => {
    try {
        const ratings = await allQuery(`SELECT pr.*, u.name as userName FROM product_ratings pr 
            JOIN users u ON pr.userId = u.id WHERE pr.productId = ? ORDER BY pr.id DESC LIMIT 20`, [req.params.id]);
        res.json(ratings);
    } catch (error) {
        console.error('خطأ في جلب التقييمات:', error);
        res.status(500).json([]);
    }
});

// الأمنيات
app.get('/api/wishlist', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        const user = await getQuery("SELECT wishlist FROM users WHERE id = ?", [req.session.userId]);
        res.json(user.wishlist ? JSON.parse(user.wishlist) : []);
    } catch (error) {
        console.error('خطأ في جلب الأمنيات:', error);
        res.status(500).json([]);
    }
});

app.post('/api/wishlist/add', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { productId } = req.body;
    try {
        const user = await getQuery("SELECT wishlist FROM users WHERE id = ?", [req.session.userId]);
        let wishlist = user.wishlist ? JSON.parse(user.wishlist) : [];
        if (!wishlist.includes(productId)) wishlist.push(productId);
        await runQuery("UPDATE users SET wishlist = ? WHERE id = ?", [JSON.stringify(wishlist), req.session.userId]);
        await addAuditLog(req.session.userId, 'ADD_WISHLIST', `أضاف منتج ${productId} إلى الأمنيات`);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إضافة الأمنية:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.post('/api/wishlist/remove', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { productId } = req.body;
    try {
        const user = await getQuery("SELECT wishlist FROM users WHERE id = ?", [req.session.userId]);
        let wishlist = user.wishlist ? JSON.parse(user.wishlist) : [];
        wishlist = wishlist.filter(id => id !== productId);
        await runQuery("UPDATE users SET wishlist = ? WHERE id = ?", [JSON.stringify(wishlist), req.session.userId]);
        await addAuditLog(req.session.userId, 'REMOVE_WISHLIST', `أزال منتج ${productId} من الأمنيات`);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إزالة الأمنية:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// حجز المخزون
app.post('/api/reserve-stock', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { items } = req.body;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    try {
        for (const item of items) {
            await runQuery("INSERT INTO reserved_stock (productId, quantity, sessionId, expiresAt) VALUES (?, ?, ?, ?)",
                [item.id, item.quantity, req.session.id, expiresAt]);
        }
        res.json({ success: true, expiresAt });
    } catch (error) {
        console.error('خطأ في حجز المخزون:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// الطلبات
app.post('/api/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency, notes } = req.body;
    const orderNumber = 'RAD-' + Date.now();
    const dateFormatted = new Date().toLocaleDateString('ar-EG');
    try {
        await runQuery(`INSERT INTO orders (userId, orderNumber, customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency, status, date, dateFormatted, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, orderNumber, customer, email, phone, address, country, JSON.stringify(items), subtotal, discount, discountAmount, shipping, total, currency || 'SAR', 'pending', new Date().toISOString(), dateFormatted, notes || '']);
        
        for (const item of items) {
            const product = await getQuery("SELECT stock FROM products WHERE id = ?", [item.id]);
            if (product) {
                await runQuery("UPDATE products SET stock = ?, soldCount = COALESCE(soldCount, 0) + ? WHERE id = ?", 
                    [product.stock - item.quantity, item.quantity, item.id]);
            }
            await runQuery("DELETE FROM reserved_stock WHERE productId = ? AND sessionId = ?", [item.id, req.session.id]);
        }
        
        const pointsEarned = Math.floor(total / 100) * 5;
        await runQuery("UPDATE users SET loyaltyPoints = COALESCE(loyaltyPoints, 0) + ? WHERE id = ?", [pointsEarned, req.session.userId]);
        
        await addAuditLog(req.session.userId, 'PLACE_ORDER', `طلب جديد رقم ${orderNumber} بقيمة ${total} ${currency}`);
        
        const settings = await getQuery("SELECT value_ar FROM settings WHERE key = 'whatsappNumber'");
        const whatsappNumber = settings?.value_ar || '966500000000';
        const message = `🦅 طلب جديد في الرعدي أونلاين\n📋 رقم: ${orderNumber}\n👤 العميل: ${customer}\n📞 ${phone}\n📍 ${address}\n💰 الإجمالي: ${total} ${currency}\n🔗 https://alradi-plus.onrender.com/orders/${orderNumber}`;
        console.log(`📱 إشعار واتساب: ${message}`);
        
        res.json({ success: true, orderNumber });
    } catch (error) {
        console.error('خطأ في إنشاء الطلب:', error);
        res.status(500).json({ error: 'حدث خطأ في إنشاء الطلب' });
    }
});

app.get('/api/my-orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        const orders = await allQuery("SELECT * FROM orders WHERE userId = ? ORDER BY id DESC", [req.session.userId]);
        orders.forEach(o => { o.items = JSON.parse(o.items); });
        res.json(orders);
    } catch (error) {
        console.error('خطأ في جلب الطلبات:', error);
        res.status(500).json([]);
    }
});

app.get('/api/orders', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const orders = await allQuery("SELECT * FROM orders ORDER BY id DESC");
        orders.forEach(o => { o.items = JSON.parse(o.items); });
        res.json(orders);
    } catch (error) {
        console.error('خطأ في جلب الطلبات:', error);
        res.status(500).json([]);
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { status, trackingNumber } = req.body;
    try {
        await runQuery("UPDATE orders SET status = ?, trackingNumber = ? WHERE id = ?", [status, trackingNumber || null, req.params.id]);
        await addAuditLog(req.session.userId, 'UPDATE_ORDER_STATUS', `تحديث حالة الطلب ${req.params.id} إلى ${status}`);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في تحديث حالة الطلب:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// كوبونات الخصم
app.get('/api/coupons', async (req, res) => {
    try {
        const coupons = await allQuery("SELECT code, value, minOrder FROM coupons WHERE expiresAt IS NULL OR expiresAt > datetime('now')");
        res.json(coupons);
    } catch (error) {
        console.error('خطأ في جلب الكوبونات:', error);
        res.status(500).json([]);
    }
});

app.post('/api/coupons', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { code, value, minOrder, expiresAt, usageLimit } = req.body;
    try {
        await runQuery("INSERT INTO coupons (code, value, minOrder, expiresAt, usageLimit, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
            [code.toUpperCase(), value, minOrder || 0, expiresAt || null, usageLimit || 999999, new Date().toISOString()]);
        await addAuditLog(req.session.userId, 'ADD_COUPON', `أضاف كوبون ${code} بنسبة ${value}%`);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إضافة الكوبون:', error);
        res.status(500).json({ error: 'الكود موجود مسبقاً' });
    }
});

app.delete('/api/coupons/:code', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try {
        await runQuery("DELETE FROM coupons WHERE code = ?", [req.params.code]);
        await addAuditLog(req.session.userId, 'DELETE_COUPON', `حذف كوبون ${req.params.code}`);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في حذف الكوبون:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// المستخدمين
app.get('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const users = await allQuery("SELECT id, name, email, role, phone, address, loyaltyPoints, createdAt, lastLogin FROM users WHERE role != 'admin'");
        res.json(users);
    } catch (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        res.status(500).json([]);
    }
});

// المجموعات
app.get('/api/groups', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const groups = await allQuery("SELECT * FROM groups");
        res.json(groups);
    } catch (error) {
        console.error('خطأ في جلب المجموعات:', error);
        res.status(500).json([]);
    }
});

app.post('/api/groups', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { name_ar, name_en } = req.body;
    try {
        await runQuery("INSERT INTO groups (name_ar, name_en, createdAt) VALUES (?, ?, ?)", [name_ar, name_en, new Date().toISOString()]);
        await addAuditLog(req.session.userId, 'ADD_GROUP', `أضاف مجموعة جديدة: ${name_ar}`);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إضافة المجموعة:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// إعدادات المتجر
app.get('/api/settings', async (req, res) => {
    try {
        const rows = await allQuery("SELECT key, value_ar, value_en FROM settings");
        const settings = {};
        rows.forEach(row => { settings[row.key] = { ar: row.value_ar, en: row.value_en }; });
        res.json(settings);
    } catch (error) {
        console.error('خطأ في جلب الإعدادات:', error);
        res.status(500).json({});
    }
});

app.post('/api/settings', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const updates = req.body;
    try {
        for (const [key, value] of Object.entries(updates)) {
            const valueAr = typeof value === 'object' ? value.ar : value;
            const valueEn = typeof value === 'object' ? value.en : value;
            await runQuery("UPDATE settings SET value_ar = ?, value_en = ?, updatedAt = ? WHERE key = ?", [valueAr, valueEn, new Date().toISOString(), key]);
        }
        await addAuditLog(req.session.userId, 'UPDATE_SETTINGS', 'تحديث إعدادات المتجر');
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في حفظ الإعدادات:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// الدردشة والرسائل
app.get('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        let messages;
        if (req.session.user.role === 'admin') {
            messages = await allQuery("SELECT * FROM messages ORDER BY id DESC LIMIT 200");
        } else {
            messages = await allQuery("SELECT * FROM messages WHERE userId = ? OR isAdmin = 1 ORDER BY id ASC", [req.session.userId]);
        }
        res.json(messages);
    } catch (error) {
        console.error('خطأ في جلب الرسائل:', error);
        res.status(500).json([]);
    }
});

app.post('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { text_ar, text_en, isAdmin } = req.body;
    try {
        await runQuery(`INSERT INTO messages (userId, sender, text_ar, text_en, isAdmin, timestamp, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, req.session.user.name, text_ar || '', text_en || '', isAdmin ? 1 : 0, new Date().toLocaleTimeString('ar-EG'), new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إرسال الرسالة:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// الإحصائيات
app.get('/api/stats', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try {
        const totalUsers = await getQuery("SELECT COUNT(*) as count FROM users WHERE role != 'admin'");
        const totalProducts = await getQuery("SELECT COUNT(*) as count FROM products");
        const totalOrders = await getQuery("SELECT COUNT(*) as count FROM orders");
        const totalRevenue = await getQuery("SELECT SUM(total) as sum FROM orders");
        const lowStock = await getQuery("SELECT COUNT(*) as count FROM products WHERE stock < 5");
        const pendingOrders = await getQuery("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
        const today = new Date().toISOString().split('T')[0];
        const todayRevenue = await getQuery("SELECT SUM(total) as sum FROM orders WHERE date LIKE ?", [today + '%']);
        
        res.json({
            totalUsers: totalUsers.count,
            totalProducts: totalProducts.count,
            totalOrders: totalOrders.count,
            totalRevenue: totalRevenue.sum || 0,
            todayRevenue: todayRevenue.sum || 0,
            lowStock: lowStock.count,
            pendingOrders: pendingOrders.count
        });
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.status(500).json({});
    }
});

app.get('/api/pending-orders-count', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    try {
        const count = await getQuery("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
        res.json({ count: count.count });
    } catch (error) {
        console.error('خطأ في جلب عدد الطلبات:', error);
        res.json({ count: 0 });
    }
});

app.get('/api/audit-logs', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const logs = await allQuery("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100");
        res.json(logs);
    } catch (error) {
        console.error('خطأ في جلب سجل النشاطات:', error);
        res.status(500).json([]);
    }
});

// وضع الطوارئ
app.get('/api/maintenance-status', async (req, res) => {
    try {
        const mode = await getQuery("SELECT value_ar FROM settings WHERE key = 'maintenanceMode'");
        res.json({ maintenance: mode?.value_ar === '1' });
    } catch (error) {
        res.json({ maintenance: false });
    }
});

// المصادقة
app.post('/api/register', async (req, res) => {
    const { name, email, password, phone, address } = req.body;
    try {
        const existing = await getQuery("SELECT id FROM users WHERE email = ?", [email]);
        if (existing) return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
        const hashed = bcrypt.hashSync(password, 10);
        await runQuery("INSERT INTO users (name, email, password, phone, address, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
            [name, email, hashed, phone || '', address || '', new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({ error: 'حدث خطأ في التسجيل' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await getQuery("SELECT * FROM users WHERE email = ?", [email]);
        if (!user) return res.status(401).json({ error: 'البريد الإلكتروني غير مسجل' });
        const match = bcrypt.compareSync(password, user.password);
        if (!match) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        req.session.userId = user.id;
        req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, address: user.address };
        await runQuery("UPDATE users SET lastLogin = ? WHERE id = ?", [new Date().toISOString(), user.id]);
        await addAuditLog(user.id, 'LOGIN', 'تسجيل دخول ناجح');
        res.json({ success: true, user: req.session.user });
    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'حدث خطأ في تسجيل الدخول' });
    }
});

app.get('/api/me', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    try {
        const user = await getQuery("SELECT id, name, email, role, phone, address, loyaltyPoints FROM users WHERE id = ?", [req.session.userId]);
        res.json(user);
    } catch (error) {
        console.error('خطأ في جلب بيانات المستخدم:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.post('/api/update-profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    const { name, phone, address, avatar } = req.body;
    try {
        await runQuery("UPDATE users SET name = ?, phone = ?, address = ?, avatar = ? WHERE id = ?",
            [name, phone || '', address || '', avatar || '', req.session.userId]);
        req.session.user.name = name;
        await addAuditLog(req.session.userId, 'UPDATE_PROFILE', 'تحديث بيانات الملف الشخصي');
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في تحديث الملف الشخصي:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.post('/api/logout', (req, res) => {
    if (req.session.userId) addAuditLog(req.session.userId, 'LOGOUT', 'تسجيل خروج');
    req.session.destroy();
    res.json({ success: true });
});

// سجل النشاطات
async function addAuditLog(userId, action, details) {
    try {
        await runQuery("INSERT INTO audit_logs (userId, action, details, createdAt) VALUES (?, ?, ?, ?)", 
            [userId, action, details, new Date().toISOString()]);
    } catch (err) {
        console.error("خطأ في تسجيل النشاط:", err);
    }
}

// الصفحات
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🦅 الرعدي أونلاين | المتجر العالمي الأسطوري`);
    console.log(`🚀 الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`👑 المدير: admin@raadi.com / admin123`);
    console.log(`========================================`);
});
