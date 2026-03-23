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
maxHttpBufferSize: 1e8
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
// Фикс кодировки: декодируем из Latin1 в UTF-8, если Multer исказил имя
let fileName = file.originalname;
try {
fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
} catch (e) { console.log("Encoding skip"); }

cb(null, Date.now() + '-' + fileName.replace(/\s+/g, '_'));
}
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'No file' });

let originalName = req.file.originalname;
try {
originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
} catch(e) {}

res.json({
fileUrl: `/uploads/${req.file.filename}`,
fileType: req.file.mimetype,
fileName: originalName
});
});

// МОНГО: Обязательно добавь IP Render в WhiteList в MongoDB Atlas!
const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.mongodb.net/chatDB?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
.then(() => console.log('✅ База на связи'))
.catch(e => console.error('❌ Ошибка базы:', e));

const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileType: String, fileName: String,
date: { type: Date, default: Date.now }
});
const Msg = mongoose.model('Msg', msgSchema);

io.on('connection', (socket) => {
console.log('User connected');

socket.on('join', async ({ user, room }) => {
socket.join(room);
try {
// Принудительная отправка истории при входе
const history = await Msg.find({ room }).sort({ date: 1 }).limit(100);
socket.emit('history', history);
} catch (e) { console.log(e); }
});

socket.on('message', async (data) => {
try {
const m = new Msg(data);
const saved = await m.save();
io.to(data.room).emit('renderMsg', saved);
} catch (e) {
console.error("Save error:", e);
io.to(data.room).emit('renderMsg', data);
}
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`v8.2 Overdrive ON ${PORT}`));