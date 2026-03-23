const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Максимальный лимит для работы с большими данными
app.use(express.json({limit: '100mb'}));
app.use(express.urlencoded({limit: '100mb', extended: true}));

const io = new Server(server, {
cors: { origin: "*" },
transports: ['websocket', 'polling'],
maxHttpBufferSize: 1e8
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));

// ИСПОЛЬЗУЕМ SRV ДЛЯ СКОРОСТИ
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';

let gfsBucket;

const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileId: String, fileType: String, fileName: String,
createdAt: { type: Date, default: Date.now, expires: 86400 }
});
const Msg = mongoose.model('Msg', msgSchema);

mongoose.connect(MONGO_URI)
.then(() => {
console.log('🚀 v10.0: ТУРБО-СВЯЗЬ С БАЗОЙ УСТАНОВЛЕНА');
gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
})
.catch(e => console.error('❌ ОШИБКА:', e.message));

const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
if (!gfsBucket || !req.file) return res.status(500).json({ error: 'Ошибка инициализации' });

// ФИКС НАЗВАНИЙ: Декодируем из latin1 в UTF-8
let correctName = req.file.originalname;
try {
correctName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
} catch(e) { console.log('Ошибка кодировки'); }

const writeStream = gfsBucket.openUploadStream(correctName, {
contentType: req.file.mimetype,
metadata: { originalName: correctName }
});

fs.createReadStream(req.file.path).pipe(writeStream)
.on('finish', () => {
if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
res.json({
fileUrl: `/file/${writeStream.id}`,
fileId: writeStream.id,
fileType: req.file.mimetype,
fileName: correctName
});
})
.on('error', () => res.status(500).json({ error: 'Ошибка записи' }));
});

app.get('/file/:id', async (req, res) => {
try {
const fileId = new mongoose.Types.ObjectId(req.params.id);
const files = await gfsBucket.find({ _id: fileId }).toArray();
if (!files.length) return res.status(404).send('Файл не найден');

const file = files[0];
// ФИКС СКАЧИВАНИЯ: Правильные заголовки для стабильности
res.set({
'Content-Type': file.contentType,
'Content-Disposition': req.query.download === '1'
? `attachment; filename="${encodeURIComponent(file.filename)}"`
: 'inline',
'Cache-Control': 'public, max-age=86400'
});

gfsBucket.openDownloadStream(fileId).pipe(res);
} catch (e) { res.status(400).send('Ошибка запроса'); }
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
io.to(data.room).emit('renderMsg', { ...data, _id:m._id });
await m.save().catch(e => console.log(e));
});

socket.on('deleteMsg', async ({ id, room, fileId }) => {
try {
await Msg.findByIdAndDelete(id);
if (fileId && gfsBucket) {
const fId = new mongoose.Types.ObjectId(fileId);
gfsBucket.delete(fId).catch(() => {});
}
io.to(room).emit('msgDeleted', id);
} catch (e) {}
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`v10.0 TURBO LIVE`));