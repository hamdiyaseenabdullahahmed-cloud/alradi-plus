const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// قاعدة البيانات
const DB_PATH = path.join(__dirname, 'database.db');

const db = new sqlite3.Database(DB_PATH);

// إنشاء الجدول
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'client',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// إضافة المدير مباشرة (بشكل مؤكد)
const adminEmail = 'admin@system.com';
const adminPassword = 'admin123';
const hashedPassword = bcrypt.hashSync(adminPassword, 10);

db.get(`SELECT * FROM users WHERE email = ?`, [adminEmail], (err, row) => {
    if (err) console.log(err);
    else if (!row) {
        db.run(`INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)`,
            ['مدير النظام', adminEmail, hashedPassword, '0500000000', 'admin']);
        console.log('✅ تم إضافة حساب المدير');
    } else {
        console.log('✅ حساب المدير موجود مسبقاً');
    }
});

// ========== API ==========

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.json({ success: false, error: err.message });
        if (!user) return res.json({ success: false, error: 'البريد غير موجود' });
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.json({ success: false, error: 'كلمة المرور غير صحيحة' });
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    });
});

// تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    const { name, email, password, phone } = req.body;
    
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, existing) => {
        if (existing) return res.json({ success: false, error: 'البريد مسجل مسبقاً' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)`,
            [name, email, hashedPassword, phone || '', 'client'],
            function(err2) {
                if (err2) return res.json({ success: false, error: err2.message });
                res.json({ success: true, message: 'تم التسجيل بنجاح' });
            });
    });
});

// جلب جميع المنتجات
app.get('/api/products', (req, res) => {
    res.json({ success: true, data: [
        { id: 1, name: 'iPhone 15 Pro', price: 3999, image: 'https://picsum.photos/id/1/300/300', stock: 10 },
        { id: 2, name: 'ساعة ذكية', price: 499, image: 'https://picsum.photos/id/2/300/300', stock: 20 },
        { id: 3, name: 'سماعات لاسلكية', price: 299, image: 'https://picsum.photos/id/3/300/300', stock: 50 }
    ]});
});

// ========== الصفحات ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client.html')));
app.get('/client.html', (req, res) => res.sendFile(path.join(__dirname, 'client.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`👑 مدير: admin@system.com / admin123`);
});
