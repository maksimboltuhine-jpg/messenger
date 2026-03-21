const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
cors: { origin: "*" },
transports: ['websocket', 'polling']
});

// Работа с папкой загрузок
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
cb(null, uniqueSuffix + path.extname(file.originalname));
}
});
const upload = multer({ storage });

// Роут загрузки с исправленным ответом
app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).send('Файл не получен');
// Отправляем чистый путь
const fileUrl = `/uploads/${req.file.filename}`;
res.json({ fileUrl, fileType: req.file.mimetype });
});

// ПОДКЛЮЧЕНИЕ К БАЗЕ (Вставь сюда свою рабочую ссылку!)
const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.mongodb.net/chatDB?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI)
.then(() => console.log('✅ База данных: СВЯЗЬ УСТАНОВЛЕНА'))
.catch(err => console.log('❌ Ошибка БД (История не будет работать):', err));

const msgSchema = new mongoose.Schema({
user: String,
text: String,
room: String,
fileUrl: String,
fileType: String,
date: { type: Date, default: Date.now }
});
const Msg = mongoose.model('Msg', msgSchema);

io.on('connection', (socket) => {
console.log('Подключен:', socket.id);

socket.on('join', async ({ user, room }) => {
socket.join(room);
// Достаем историю из базы при входе
try {
const history = await Msg.find({ room }).sort({ date: 1 }).limit(100);
socket.emit('history', history);
} catch (e) { console.log('Ошибка получения истории:', e); }
});

socket.on('message', async (data) => {
try {
const m = new Msg(data);
await m.save(); // Сначала сохраняем
io.to(data.room).emit('renderMsg', m); // Потом рассылаем сохраненный объект
} catch (e) {
console.log('Ошибка сохранения:', e);
io.to(data.room).emit('renderMsg', data); // Если база упала, всё равно шлем
}
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`v6.0 запущен на порту ${PORT}`));