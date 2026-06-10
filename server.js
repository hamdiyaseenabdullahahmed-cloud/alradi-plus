const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public")); // يخدم ملفات index.html و admin.html

// مثال: تسجيل دخول بسيط
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  // لاحقًا سنربط قاعدة البيانات
  if (email === "admin@store.com" && password === "123456") {
    const token = jwt.sign({ role: "admin" }, "secretKey", { expiresIn: "1h" });
    res.json({ success: true, token });
  } else {
    res.json({ success: false, message: "بيانات الدخول غير صحيحة" });
  }
});

// مثال: جلب المنتجات
app.get("/products", (req, res) => {
  const products = [
    { id: 1, name: "هاتف ذكي فاخر", price: 999, stock: 20 },
    { id: 2, name: "عطر مميز", price: 250, stock: 50 }
  ];
  res.json(products);
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 الرعدي أونلاين يعمل على المنفذ ${PORT}`);
});
