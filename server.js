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
maxHttpBufferSize: 1e8 // 100MB лимит для сокетов
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));

// ВСТАВЬ СВОЮ ССЫЛКУ MONGODB ТУТ!
const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.mongodb.net/chatDB?retryWrites=true&w=majority';

let gfsBucket;

mongoose.connect(MONGO_URI)
.then(() => {
console.log('✅ DB Connected');
gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
})
.catch(e => console.error('DB Error:', e));

// СХЕМА С АВТО-УДАЛЕНИЕМ (Через 24 часа = 86400 секунд)
const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileId: String, fileType: String, fileName: String,
createdAt: { type: Date, default: Date.now, expires: 86400 }
});
const Msg = mongoose.model('Msg', msgSchema);

const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'No file' });

let originalName = req.file.originalname;
try { originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch(e) {}

const writeStream = gfsBucket.openUploadStream(originalName, { contentType: req.file.mimetype });
fs.createReadStream(req.file.path).pipe(writeStream);

writeStream.on('finish', () => {
if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
res.json({
fileUrl: `/file/${writeStream.id}`,
fileId: writeStream.id,
fileType: req.file.mimetype,
fileName: originalName
});
});
});

app.get('/file/:id', async (req, res) => {
try {
const fileId = new mongoose.Types.ObjectId(req.params.id);
const files = await gfsBucket.find({ _id: fileId }).toArray();
if (!files || files.length === 0) return res.status(404).send('Файл истек или удален');

const file = files[0];
const encodedName = encodeURIComponent(file.filename);

res.set({
'Content-Type': file.contentType,
'Content-Length': file.length,
'Content-Disposition': req.query.download === '1'
? `attachment; filename*=UTF-8''${encodedName}`
: `inline; filename*=UTF-8''${encodedName}`
});

gfsBucket.openDownloadStream(fileId).pipe(res);
} catch (err) { res.status(500).send('Ошибка файла'); }
});

io.on('connection', (socket) => {
socket.on('join', async ({ user, room }) => {
socket.join(room);
const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50);
socket.emit('history', history);
});

socket.on('message', (data) => {
const tempId = new mongoose.Types.ObjectId();
io.to(data.room).emit('renderMsg', { ...data, _id: tempId });
new Msg(data).save();
});

socket.on('deleteMsg', async ({ id, room, fileId }) => {
try {
await Msg.findByIdAndDelete(id);
if (fileId) gfsBucket.delete(new mongoose.Types.ObjectId(fileId)).catch(() => {});
io.to(room).emit('msgDeleted', id);
} catch (e) {}
});
});

server.listen(process.env.PORT || 10000, '0.0.0.0', () => console.log(`v9.1 Nitro Ready`));