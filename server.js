const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// إعداد الاتصال بقاعدة البيانات (تعدل القيم من Render)
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "alraadi_db",
  password: process.env.DB_PASSWORD || "password",
  port: process.env.DB_PORT || 5432
});

// مثال: جلب المنتجات
app.get("/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("خطأ في جلب المنتجات");
  }
});

// مثال: تسجيل مستخدم جديد
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    await pool.query("INSERT INTO users (username, password) VALUES ($1, $2)", [username, password]);
    res.send("تم تسجيل المستخدم بنجاح");
  } catch (err) {
    console.error(err);
    res.status(500).send("خطأ في التسجيل");
  }
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`🚀 الرعدي بلاس يعمل على المنفذ ${PORT}`);
});
