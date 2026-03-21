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

// Папка для загрузок
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Настройка Multer
const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
cb(null, uniqueName);
}
});
const upload = multer({ storage });

// Роут для загрузки файлов
app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });
res.json({ fileUrl: `/uploads/${req.file.filename}`, fileType: req.file.mimetype });
});

// МОНГО (ВСТАВЬ СВОЮ ССЫЛКУ)
const MONGO_URI = 'mongodb+srv://твой_логин:твой_пароль@cluster0.mongodb.net/messenger?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI)
.then(() => console.log('✅ MongoDB подключена'))
.catch(err => console.error('❌ Ошибка БД:', err));

const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileType: String, date: { type: Date, default: Date.now }
});
const Msg = mongoose.model('Msg', msgSchema);

// СОКЕТЫ И КОМНАТЫ
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
await newMsg.save();
io.to(data.room).emit('renderMsg', newMsg);
} catch (e) { console.log(e); }
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));