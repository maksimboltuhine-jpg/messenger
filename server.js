const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Папка для хранения файлов
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Настройка Multer для приема файлов
const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
const safeName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
cb(null, safeName);
}
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // Лимит 100МБ

// Эндпоинт загрузки
app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'Файл не найден' });
res.json({ fileUrl: `/uploads/${req.file.filename}`, fileType: req.file.mimetype });
});

// БАЗА ДАННЫХ (Укажи свои данные здесь!)
const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.mongodb.net/messenger?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileType: String, date: { type: Date, default: Date.now }
});
const Msg = mongoose.model('Msg', msgSchema);

// ЛОГИКА ЧАТА
io.on('connection', (socket) => {
socket.on('join', async ({ user, room }) => {
socket.join(room);
try {
const history = await Msg.find({ room }).sort({ date: 1 }).limit(100);
socket.emit('history', history);
} catch (e) { console.log(e); }
});

socket.on('message', async (data) => {
try {
const newMsg = new Msg(data);
const savedMsg = await newMsg.save();
// Рассылаем ВСЕМ в комнате, чтобы сообщение сразу появилось
io.to(data.room).emit('renderMsg', savedMsg);
} catch (e) { console.log(e); }
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));