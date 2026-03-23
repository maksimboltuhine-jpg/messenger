const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Лимиты на объем данных
app.use(express.json({limit: '100mb'}));
app.use(express.urlencoded({limit: '100mb', extended: true}));

const io = new Server(server, {
cors: { origin: "*" },
transports: ['websocket', 'polling'],
maxHttpBufferSize: 1e8 // 100MB
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));

// НОВЫЙ ФОРМАТ ССЫЛКИ (SRV) — УЖЕ С ТВОИМ ПАРОЛЕМ И БАЗОЙ
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';

let gfsBucket;

// Схема с авто-удалением (Индекс создается сам)
const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileId: String, fileType: String, fileName: String,
createdAt: { type: Date, default: Date.now, expires: 86400 } // Удаление через 24ч
});
const Msg = mongoose.model('Msg', msgSchema);

mongoose.connect(MONGO_URI)
.then(() => {
console.log('✅ СВЯЗЬ С БАЗОЙ УСТАНОВЛЕНА (SRV)');
gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
})
.catch(e => console.error('❌ ОШИБКА ПОДКЛЮЧЕНИЯ:', e.message));

const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file || !gfsBucket) return res.status(500).json({ error: 'База не готова' });

// Фикс кодировки (чтобы не было кракозябр в именах файлов)
let originalName = req.file.originalname;
try { originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch(e) {}

const writeStream = gfsBucket.openUploadStream(originalName, { contentType: req.file.mimetype });
fs.createReadStream(req.file.path).pipe(writeStream)
.on('finish', () => {
if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
res.json({ fileUrl: `/file/${writeStream.id}`, fileId: writeStream.id, fileType: req.file.mimetype, fileName: originalName });
})
.on('error', (err) => {
console.error('Ошибка записи:', err);
res.status(500).json({ error: 'Ошибка БД' });
});
});

app.get('/file/:id', async (req, res) => {
try {
const fileId = new mongoose.Types.ObjectId(req.params.id);
const files = await gfsBucket.find({ _id: fileId }).toArray();
if (!files.length) return res.status(404).send('Файл удален');
res.set({'Content-Type': files[0].contentType, 'Content-Disposition': req.query.download === '1' ? 'attachment' : 'inline'});
gfsBucket.openDownloadStream(fileId).pipe(res);
} catch (e) { res.status(400).send('Ошибка ID'); }
});

io.on('connection', (socket) => {
socket.on('join', async ({ user, room }) => {
socket.join(room);
try {
const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50);
socket.emit('history', history);
} catch(e) {}
});

socket.on('message', async (data) => {
const m = new Msg(data);
io.to(data.room).emit('renderMsg', { ...data, _id: m._id });
await m.save().catch(e => console.log('Save error:', e));
});

socket.on('deleteMsg', async ({ id, room, fileId }) => {
try {
await Msg.findByIdAndDelete(id);
if (fileId && gfsBucket) gfsBucket.delete(new mongoose.Types.ObjectId(fileId)).catch(() => {});
io.to(room).emit('msgDeleted', id);
} catch (e) {}
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`v9.7 LIVE ON ${PORT}`));