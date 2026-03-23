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
let fileName = file.originalname;
try { fileName = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch (e) {}
cb(null, Date.now() + '-' + fileName.replace(/\s+/g, '_'));
}
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'No file' });
let name = req.file.originalname;
try { name = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch(e) {}
res.json({ fileUrl: `/uploads/${req.file.filename}`, fileType: req.file.mimetype, fileName: name });
});

const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.mongodb.net/chatDB?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI).then(() => console.log('DB OK')).catch(e => console.log('DB ERR', e));

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
const history = await Msg.find({ room }).sort({ date: 1 }).limit(100);
socket.emit('history', history);
} catch (e) {}
});

socket.on('message', (data) => {
// РАЗГОН: Сначала рассылаем всем (мгновенно), потом сохраняем
const tempId = Date.now() + Math.random();
const msgData = { ...data, _id: data._id || tempId };

io.to(data.room).emit('renderMsg', msgData);

const m = new Msg(data);
m.save().then(saved => {
// Если нужно, можно отправить подтверждение, но для скорости лучше так
}).catch(e => console.error("Save error", e));
});

// ЛОГИКА УДАЛЕНИЯ
socket.on('deleteMsg', async ({ id, room }) => {
try {
await Msg.findByIdAndDelete(id);
io.to(room).emit('msgDeleted', id);
} catch (e) { console.log("Delete error", e); }
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`v8.3 Nitro ON ${PORT}`));