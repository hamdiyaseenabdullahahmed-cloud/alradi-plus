const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد هام جداً لمنصات الرفع السحابية مثل Render للوثوق ببروتوكول الأمان وتأمين الجلسات
app.set('trust proxy', 1);

app.use(session({
    secret: 'raadi-emperor-falcon-secure-key-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24 * 7, // أسبوع كامل
        secure: false, // يجب إبقاؤها false لضمان استقرار عمل الجلسة على خوادم الرفع المجانية
        sameSite: 'lax'
    }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------- تهيئة وتطوير قاعدة البيانات ----------------------------
const db = new sqlite3.Database('./raadi.db');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL, oldPrice REAL, discount INTEGER DEFAULT 0, color TEXT, features TEXT, stock INTEGER DEFAULT 0, image TEXT, createdAt TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', phone TEXT, address TEXT, avatar TEXT, createdAt TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, orderNumber TEXT UNIQUE, customer TEXT, email TEXT, phone TEXT, address TEXT, country TEXT, items TEXT, subtotal REAL, discount INTEGER, discountAmount REAL, shipping REAL, total REAL, status TEXT, date TEXT, dateFormatted TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, sender TEXT, text TEXT, isAdmin INTEGER DEFAULT 0, isRead INTEGER DEFAULT 0, timestamp TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, members TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, value INTEGER, createdAt TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);

    // إدخال الإعدادات الافتراضية
    db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
        if (row && row.count === 0) {
            ['هواتف', 'عطور', 'إكسسوارات', 'إلكترونيات'].forEach(cat => {
                db.run("INSERT INTO categories (name) VALUES (?)", [cat]);
            });
        }
    });
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
        if (row && row.count === 0) {
            const sample = [
                ['هاتف الرعدي برو X', 'هواتف', 2999, 3499, 15, 'أسود تيتانيوم', 'معالج تيتانيوم كاميرا فائقة الدقة والوضوح شاشة ممتازة 6.8 بوصة', 10, 'https://picsum.photos/id/0/300/300'],
                ['سامسونج S24 الترا', 'هواتف', 4940, 5200, 12, 'رمادي تيتانيوم', 'قلم ذكي مدمج وشاشة عالية السطوع بمواصفات جبارة', 8, 'https://picsum.photos/id/1/300/300'],
                ['سماعة إيربودز برو', 'إكسسوارات', 899, 1099, 18, 'أبيض ناصع', 'تقنية نشطة لعزل الضوضاء المحيطة وصوت محيطي فخم', 20, 'https://picsum.photos/id/3/300/300'],
                ['عطر بلو دي شانيل', 'عطور', 4140, 4600, 10, 'كحلي داكن', 'عبق فريد يدوم طويلاً لأصحاب الفخامة والروعة الملوكية', 6, 'https://picsum.photos/id/2/300/300']
            ];
            const stmt = db.prepare("INSERT INTO products (name, category, price, oldPrice, discount, color, features, stock, image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            sample.forEach(p => stmt.run(...p, new Date().toISOString()));
            stmt.finalize();
        }
    });
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO users (name, email, password, role, avatar, createdAt) VALUES (?, ?, ?, ?, ?, ?)", ['المدير العام', 'admin@raadi.com', bcrypt.hashSync('admin123', 10), 'admin', '', new Date().toISOString()]);
        }
    });
    db.get("SELECT COUNT(*) as count FROM settings", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO settings (key, value) VALUES ('domesticShipping', '15')");
            db.run("INSERT INTO settings (key, value) VALUES ('internationalShipping', '50')");
            db.run("INSERT INTO settings (key, value) VALUES ('whatsappNumber', '+967781723532')");
            db.run("INSERT INTO settings (key, value) VALUES ('marqueeText', '🦅 أهلاً ومرحباً بكم في متجر الرعدي أونلاين الفاخر - شحن مجاني للمشتريات فوق 300 ريال')");
            db.run("INSERT INTO settings (key, value) VALUES ('voiceGender', 'female')");
            db.run("INSERT INTO settings (key, value) VALUES ('voiceText', 'أهلاً وسهلاً بك في متجر الرعدي أونلاين الفاخر')");
            db.run("INSERT INTO settings (key, value) VALUES ('returnPolicy', '1. لا يلزم المتجر إعادة المنتج بعد 3 أيام من الاستلام.\\n2. لا يمكن إرجاع المنتج في حال وجود عيب ناتج عن سوء الاستخدام.\\n3. لا يلزم المتجر رد النقود نقداً ويمكن للعميل استبدال السلع بمنتج آخر بنفس القيمة.')");
        }
    });
});

const query = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
const get = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
const run = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function(err) { err ? rej(err) : res({ lastID: this.lastID }); }));

// ---------------------------- واجهات التطبيق البرمجية (APIs) ----------------------------
app.get('/api/categories', async (req, res) => {
    try { res.json((await query("SELECT name FROM categories")).map(r => r.name)); } catch { res.status(500).json([]); }
});
app.post('/api/categories', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    try { await run("INSERT INTO categories (name) VALUES (?)", [name.trim()]); res.json({ success: true }); } catch { res.status(500).json({ error: 'القسم مضاف مسبقاً' }); }
});
app.delete('/api/categories/:name', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try { await run("DELETE FROM categories WHERE name = ?", [req.params.name]); await run("DELETE FROM products WHERE category = ?", [req.params.name]); res.json({ success: true }); } catch { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.get('/api/products', async (req, res) => {
    try { res.json(await query("SELECT * FROM products ORDER BY id DESC")); } catch { res.status(500).json([]); }
});
app.post('/api/products', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { name, category, price, oldPrice, discount, color, features, stock, image } = req.body;
    try { await run(`INSERT INTO products (name, category, price, oldPrice, discount, color, features, stock, image, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)`, [name, category, price, oldPrice||0, discount||0, color, features, stock||0, image, new Date().toISOString()]); res.json({ success: true }); } catch { res.status(500).json({ error: 'حدث خطأ' }); }
});
app.put('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { name, price, oldPrice, discount, stock, image, category, color, features } = req.body;
    try { await run(`UPDATE products SET name=?, price=?, oldPrice=?, discount=?, stock=?, image=?, category=?, color=?, features=? WHERE id=?`, [name, price, oldPrice, discount, stock, image, category, color, features, req.params.id]); res.json({ success: true }); } catch { res.status(500).json({ error: 'حدث خطأ' }); }
});
app.delete('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try { await run("DELETE FROM products WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.get('/api/settings', async (req, res) => {
    try { const rows = await query("SELECT key, value FROM settings"); const s = {}; rows.forEach(r => s[r.key] = r.value); res.json(s); } catch { res.status(500).json({}); }
});
app.post('/api/settings', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try { for (const [k, v] of Object.entries(req.body)) { await run("UPDATE settings SET value = ? WHERE key = ?", [v.toString(), k]); } res.json({ success: true }); } catch { res.status(500).json({ error: 'حدث خطأ' }); }
});

// مسارات المصادقة
app.post('/api/register', async (req, res) => {
    const { name, email, password, phone, address } = req.body;
    try {
        if (await get("SELECT id FROM users WHERE email = ?", [email])) return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
        await run("INSERT INTO users (name, email, password, phone, address, role, avatar, createdAt) VALUES (?,?,?,?,?,?,?,?)", [name, email, bcrypt.hashSync(password, 10), phone, address, 'user', '', new Date().toISOString()]);
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'خطأ بالسيرفر' }); }
});
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const u = await get("SELECT * FROM users WHERE email = ?", [email]);
        if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        req.session.userId = u.id;
        req.session.user = { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, address: u.address, avatar: u.avatar };
        res.json({ success: true, user: req.session.user });
    } catch { res.status(500).json({ error: 'خطأ بالسيرفر' }); }
});
app.post('/api/profile/update', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    const { name, email, password, phone, address, avatar } = req.body;
    try {
        let passUpdate = '';
        const params = [name, email, phone, address, avatar];
        if (password && password.trim() !== '') {
            passUpdate = ', password = ?';
            params.push(bcrypt.hashSync(password, 10));
        }
        params.push(req.session.userId);
        await run(`UPDATE users SET name = ?, email = ?, phone = ?, address = ?, avatar = ? ${passUpdate} WHERE id = ?`, params);
        req.session.user = { id: req.session.userId, name, email, role: req.session.user.role, phone, address, avatar };
        res.json({ success: true, user: req.session.user });
    } catch { res.status(500).json({ error: 'خطأ في التعديل' }); }
});
app.get('/api/me', (req, res) => req.session.userId ? res.json(req.session.user) : res.status(401).json({ error: 'غير مسجل' }));
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

// الطلبات
app.post('/api/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total } = req.body;
    try {
        const num = 'RAD-' + Date.now();
        await run(`INSERT INTO orders (userId, orderNumber, customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, status, date, dateFormatted) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
            [req.session.userId, num, customer, email, phone, address, country, JSON.stringify(items), subtotal, discount, discountAmount, shipping, total, 'قيد المعالجة', new Date().toISOString(), new Date().toLocaleDateString('ar-EG')]);
        for (const item of items) {
            const p = await get("SELECT stock FROM products WHERE id = ?", [item.id]);
            if (p) await run("UPDATE products SET stock = ? WHERE id = ?", [Math.max(0, p.stock - item.quantity), item.id]);
        }
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'حدث خطأ' }); }
});
app.get('/api/my-orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try { const list = await query("SELECT * FROM orders WHERE userId = ? ORDER BY id DESC", [req.session.userId]); list.forEach(o => o.items = JSON.parse(o.items)); res.json(list); } catch { res.status(500).json([]); }
});
app.get('/api/orders', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try { const list = await query("SELECT * FROM orders ORDER BY id DESC"); list.forEach(o => o.items = JSON.parse(o.items)); res.json(list); } catch { res.status(500).json([]); }
});
app.put('/api/orders/:id/status', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try { await run("UPDATE orders SET status = ? WHERE id = ?", [req.body.status, req.params.id]); res.json({ success: true }); } catch { res.status(500).json({ error: 'خطأ' }); }
});

// مجموعات الأعضاء وبث الإعلانات
app.get('/api/groups', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try { res.json(await query("SELECT * FROM groups ORDER BY id DESC")); } catch { res.status(500).json([]); }
});
app.post('/api/groups', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try { await run("INSERT INTO groups (name, members) VALUES (?, ?)", [req.body.name, JSON.stringify([])]); res.json({ success: true }); } catch { res.status(500).json({ error: 'حدث خطأ' }); }
});
app.put('/api/groups/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try { await run("UPDATE groups SET members = ? WHERE id = ?", [JSON.stringify(req.body.members), req.params.id]); res.json({ success: true }); } catch { res.status(500).json({ error: 'خطأ' }); }
});
app.delete('/api/groups/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try { await run("DELETE FROM groups WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try { res.json(await query("SELECT id, name, email, role, phone, address, avatar, createdAt FROM users WHERE role != 'admin'")); } catch { res.status(500).json([]); }
});
app.get('/api/coupons', async (req, res) => {
    try { res.json(await query("SELECT code, value FROM coupons")); } catch { res.status(500).json([]); }
});
app.post('/api/coupons', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try { await run("INSERT INTO coupons (code, value, createdAt) VALUES (?,?,?)", [req.body.code.toUpperCase(), req.body.value, new Date().toISOString()]); res.json({ success: true }); } catch { res.status(500).json({ error: 'موجود مسبقاً' }); }
});
app.delete('/api/coupons/:code', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try { await run("DELETE FROM coupons WHERE code = ?", [req.params.code]); res.json({ success: true }); } catch { res.status(500).json({ error: 'خطأ' }); }
});

// الدردشة والرسائل المباشرة الفورية
app.get('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        let list;
        if (req.session.user.role === 'admin') {
            list = await query("SELECT * FROM messages ORDER BY id ASC LIMIT 200");
        } else {
            list = await query("SELECT * FROM messages WHERE userId = ? OR isAdmin = 1 ORDER BY id ASC", [req.session.userId]);
            await run("UPDATE messages SET isRead = 1 WHERE userId = ? AND isAdmin = 1", [req.session.userId]);
        }
        res.json(list);
    } catch { res.status(500).json([]); }
});
app.post('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل أولاً' });
    const { text, isAdmin, targetUserId } = req.body;
    const destUserId = isAdmin ? targetUserId : req.session.userId;
    const senderName = isAdmin ? 'الإدارة' : req.session.user.name;
    try { 
        await run(`INSERT INTO messages (userId, sender, text, isAdmin, isRead, timestamp, date) VALUES (?,?,?,?,?,?,?)`, 
            [destUserId, senderName, text, isAdmin ? 1 : 0, 0, new Date().toLocaleTimeString('ar-EG'), new Date().toISOString()]); 
        res.json({ success: true }); 
    } catch { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/stats', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try {
        const u = await get("SELECT COUNT(*) as count FROM users WHERE role != 'admin'");
        const p = await get("SELECT COUNT(*) as count FROM products");
        const o = await get("SELECT COUNT(*) as count FROM orders");
        const rev = await get("SELECT SUM(total) as sum FROM orders");
        const low = await get("SELECT COUNT(*) as count FROM products WHERE stock < 5");
        const todayISO = new Date().toISOString().split('T')[0];
        const todayRev = await get("SELECT SUM(total) as sum FROM orders WHERE date LIKE ?", [todayISO + '%']);
        res.json({ totalUsers: u.count, totalProducts: p.count, totalOrders: o.count, totalRevenue: rev.sum || 0, todayRevenue: todayRev.sum || 0, lowStock: low.count });
    } catch { res.status(500).json({}); }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 متجر الرعدي الأسطوري يعمل بنجاح على الرابط المباشر: http://localhost:${PORT}`);
    console.log(`========================================`);
});
