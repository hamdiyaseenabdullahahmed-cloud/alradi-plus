const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DB_PATH = '/var/lib/sqlite/raadi.db';
const BACKUP_PATH = '/var/backups/raadi/';

if (!fs.existsSync(BACKUP_PATH)) {
    fs.mkdirSync(BACKUP_PATH, { recursive: true });
}

const backupFile = path.join(BACKUP_PATH, `raadi_backup_${Date.now()}.db`);
fs.copyFile(DB_PATH, backupFile, (err) => {
    if (err) {
        console.error('❌ فشل النسخ الاحتياطي:', err);
        process.exit(1);
    }
    console.log(`✅ تم إنشاء النسخة الاحتياطية: ${backupFile}`);
    
    // ضغط الملف
    exec(`gzip ${backupFile}`, (err2) => {
        if (!err2) console.log(`📦 تم ضغط النسخة الاحتياطية`);
    });
    
    process.exit(0);
});