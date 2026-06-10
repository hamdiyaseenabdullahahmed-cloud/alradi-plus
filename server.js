const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey';

// ✅ تسجيل مستخدم جديد
app.post('/api/auth/register', async (req,res)=>{
  const {username,email,password} = req.body;
  try{
    const hashed = await bcrypt.hash(password,10);
    const result = await pool.query(
      'INSERT INTO users (username,email,password,role) VALUES ($1,$2,$3,$4) RETURNING id',
      [username,email,hashed,'customer']
    );
    res.json({ok:true,id:result.rows[0].id});
  }catch(err){
    console.error(err);
    res.json({ok:false,error:'فشل التسجيل'});
  }
});

// ✅ تسجيل دخول
app.post('/api/auth/login', async (req,res)=>{
  const {username,password} = req.body;
  try{
    const result = await pool.query(
      'SELECT * FROM users WHERE username=$1 OR email=$1',
      [username]
    );
    if(!result.rows.length) return res.json({ok:false,error:'المستخدم غير موجود'});
    const user = result.rows[0];
    const match = await bcrypt.compare(password,user.password);
    if(!match) return res.json({ok:false,error:'كلمة المرور غير صحيحة'});
    const token = jwt.sign({id:user.id,role:user.role},JWT_SECRET,{expiresIn:'1d'});
    res.json({ok:true,token,role:user.role});
  }catch(err){
    console.error(err);
    res.json({ok:false,error:'فشل تسجيل الدخول'});
  }
});

// ✅ وسيط للتحقق من التوكن
function authMiddleware(req,res,next){
  const header = req.headers['authorization'];
  if(!header) return res.status(401).json({error:'مطلوب تسجيل الدخول'});
  const token = header.split(' ')[1];
  try{
    const decoded = jwt.verify(token,JWT_SECRET);
    req.user = decoded;
    next();
  }catch(err){
    return res.status(401).json({error:'توكن غير صالح'});
  }
}

// ✅ إحصائيات المدير
app.get('/api/admin/stats', authMiddleware, async (req,res)=>{
  if(req.user.role!=='admin') return res.status(403).json({error:'غير مصرح'});
  try{
    const products = await pool.query('SELECT COUNT(*) FROM products');
    const orders = await pool.query('SELECT COUNT(*) FROM orders');
    const revenue = await pool.query('SELECT COALESCE(SUM(total),0) FROM orders');
    res.json({
      products: products.rows[0].count,
      orders: orders.rows[0].count,
      revenue: revenue.rows[0].coalesce
    });
  }catch(err){ console.error(err); res.json({error:'فشل تحميل الإحصائيات'}); }
});

// ✅ المنتجات
app.get('/api/products', async (req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json(result.rows);
  }catch(err){ console.error(err); res.json([]); }
});

// ✅ إضافة منتج (مدير فقط)
app.post('/api/admin/products', authMiddleware, async (req,res)=>{
  if(req.user.role!=='admin') return res.status(403).json({error:'غير مصرح'});
  // ملاحظة: هنا تحتاج multer لرفع الصور، لكن سنبسطها
  res.json({ok:true});
});

// ✅ حذف منتج
app.delete('/api/admin/products/:id', authMiddleware, async (req,res)=>{
  if(req.user.role!=='admin') return res.status(403).json({error:'غير مصرح'});
  try{
    await pool.query('DELETE FROM products WHERE id=$1',[req.params.id]);
    res.json({ok:true});
  }catch(err){ console.error(err); res.json({ok:false}); }
});

// ✅ الطلبات
app.get('/api/orders', authMiddleware, async (req,res)=>{
  if(req.user.role!=='admin') return res.status(403).json({error:'غير مصرح'});
  try{
    const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(result.rows);
  }catch(err){ console.error(err); res.json([]); }
});

// ✅ الفاتورة (PDF تجريبي)
app.get('/api/invoice/:id', authMiddleware, async (req,res)=>{
  res.send(`<h1>فاتورة الطلب رقم ${req.params.id}</h1>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server running on port '+PORT));
