const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Настройка Socket.io v5.0
const io = new Server(server, {
cors: {
origin: "*",
methods: ["GET", "POST"]
},
transports: ['websocket', 'polling']
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
cb(null, Date.now() + '-' + file.originalname);
}
});
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'No file' });
res.json({ fileUrl: `/uploads/${req.file.filename}`, fileType: req.file.mimetype });
});

// МОНГО (ПРОВЕРЬ ССЫЛКУ!)
const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.mongodb.net/chat?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI).then(() => console.log('DB OK')).catch(e => console.log('DB ERR:', e));

const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileType: String, date: { type: Date, default: Date.now }
});
const Msg = mongoose.model('Msg', msgSchema);

io.on('connection', (socket) => {
console.log('User connected:', socket.id);

socket.on('join', async ({ user, room }) => {
socket.join(room);
try {
const history = await Msg.find({ room }).sort({ date: 1 }).limit(50);
socket.emit('history', history);
} catch (e) { console.log(e); }
});

socket.on('message', async (data) => {
// Рассылаем СРАЗУ всем в комнате
io.to(data.room).emit('renderMsg', data);

// Сохраняем в фоне
try {
const m = new Msg(data);
await m.save();
} catch (e) { console.log('Save error:', e); }
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`v5.0 Running on ${PORT}`));