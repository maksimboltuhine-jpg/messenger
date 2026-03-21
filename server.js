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
transports: ['websocket', 'polling'],
maxHttpBufferSize: 1e8,
pingTimeout: 120000
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
// Оставляем оригинальное имя максимально чистым для сохранения метаданных
const cleanName = file.originalname.replace(/\s+/g, '_');
cb(null, Date.now() + '-' + cleanName);
}
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'No file' });
res.json({
fileUrl: `/uploads/${req.file.filename}`,
fileType: req.file.mimetype,
fileName: req.file.originalname // Передаем ориг. имя для отображения
});
});

// МОНГО: ВНИМАНИЕ! Проверь пароль и доступ 0.0.0.0/0 в панели Atlas
const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.mongodb.net/chatDB?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI)
.then(() => console.log('✅ MongoDB Connected: История будет жить!'))
.catch(e => console.error('❌ MongoDB Error:', e));

const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileType: String, fileName: String,
date: { type: Date, default: Date.now }
});
const Msg = mongoose.model('Msg', msgSchema);

io.on('connection', (socket) => {
socket.on('join', async ({ user, room }) => {
socket.join(room);
try {
// Загружаем последние 50 сообщений при входе
const history = await Msg.find({ room }).sort({ date: 1 }).limit(50);
socket.emit('history', history);
} catch (e) { console.log('History load error:', e); }
});

socket.on('message', async (data) => {
// Сначала сохраняем, чтобы в историю попало ID и точное время
try {
const m = new Msg(data);
const saved = await m.save();
io.to(data.room).emit('renderMsg', saved);
} catch (e) {
console.error('Save failed:', e);
io.to(data.room).emit('renderMsg', data);
}
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`v8.1 Overdrive ON ${PORT}`));