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

// НОВЫЙ МАРШРУТ ДЛЯ СКАЧИВАНИЯ (Стриминг)
app.get('/download/:filename', (req, res) => {
const filePath = path.join(uploadDir, req.params.filename);

if (fs.existsSync(filePath)) {
const stat = fs.statSync(filePath);
const originalName = req.query.name || req.params.filename;

// Кодируем имя для заголовка, чтобы не было кракозябр при сохранении
const encodedName = encodeURIComponent(originalName);

res.writeHead(200, {
'Content-Type': 'application/octet-stream',
'Content-Length': stat.size,
'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`
});

// Прямой поток из файла в браузер (память не ест!)
const readStream = fs.createReadStream(filePath);
readStream.pipe(res);
} else {
res.status(404).send('Файл не найден');
}
});

const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
let name = file.originalname;
try { name = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch (e) {}
cb(null, Date.now() + '-' + name.replace(/\s+/g, '_'));
}
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'No file' });
let name = req.file.originalname;
try { name = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch(e) {}
res.json({ fileUrl: `/uploads/${req.file.filename}`, fileId: req.file.filename, fileType: req.file.mimetype, fileName: name });
});

const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.mongodb.net/chatDB?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI).catch(e => console.log('DB ERR', e));

const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileId: String, fileType: String, fileName: String,
date: { type: Date, default: Date.now }
});
const Msg = mongoose.model('Msg', msgSchema);

io.on('connection', (socket) => {
socket.on('join', async ({ user, room }) => {
socket.join(room);
try {
const history = await Msg.find({ room }).sort({ date: 1 }).limit(100);
socket.emit('history', history);
} catch (e) {}
});

socket.on('message', (data) => {
const tempId = Date.now() + Math.random();
io.to(data.room).emit('renderMsg', { ...data, _id: data._id || tempId });
new Msg(data).save().catch(e => console.error(e));
});

socket.on('deleteMsg', async ({ id, room }) => {
try {
await Msg.findByIdAndDelete(id);
io.to(room).emit('msgDeleted', id);
} catch (e) {}
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`v8.4 Titanium ON ${PORT}`));