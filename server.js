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
pingTimeout: 60000
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
// Убираем пробелы, чтобы ссылки не бились
cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
}
});
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'No file' });
res.json({ fileUrl: `/uploads/${req.file.filename}`, fileType: req.file.mimetype });
});

// МОНГО (ВСТАВЬ СВОЮ ССЫЛКУ!)
const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.mongodb.net/chatDB?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI).catch(e => console.log('DB ERROR:', e));

const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileType: String, date: { type: Date, default: Date.now }
});
const Msg = mongoose.model('Msg', msgSchema);

io.on('connection', (socket) => {
socket.on('join', async ({ user, room }) => {
socket.join(room);
try {
const history = await Msg.find({ room }).sort({ date: 1 }).limit(50);
socket.emit('history', history);
} catch (e) { console.log(e); }
});

socket.on('message', (data) => {
// Мгновенная рассылка всем в комнате
io.to(data.room).emit('renderMsg', data);
// Сохранение в базу на фоне (не тормозит чат)
const m = new Msg(data);
m.save().catch(e => console.log('Save Err:', e));
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`v7.2 Turbo ON ${PORT}`));