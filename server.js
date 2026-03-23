const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const app = express();
const server = http.createServer(app);

app.use(compression()); // Сжимает данные перед отправкой в браузер
app.use(express.json({limit: '100mb'}));
app.use(express.urlencoded({limit: '100mb', extended: true}));

const io = new Server(server, {
cors: { origin: "*" },
transports: ['websocket', 'polling'],
maxHttpBufferSize: 1e8,
pingTimeout: 60000
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));

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
console.log('🚀 v10.2: OVERDRIVE ACTIVE');
gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
})
.catch(e => console.error("Ошибка базы:", e.message));

const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
if (!gfsBucket || !req.file) return res.status(500).json({ error: 'Ошибка сервера' });

let correctName = req.file.originalname;
try { correctName = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch(e) {}

const writeStream = gfsBucket.openUploadStream(correctName, { contentType: req.file.mimetype });

fs.createReadStream(req.file.path)
.pipe(writeStream)
.on('finish', () => {
fs.promises.unlink(req.file.path).catch(() => {});
res.json({ fileUrl: `/file/${writeStream.id}`, fileId: writeStream.id, fileType: req.file.mimetype, fileName: correctName });
})
.on('error', (err) => res.status(500).json({ error: err.message }));
});

app.get('/file/:id', async (req, res) => {
try {
const fileId = new mongoose.Types.ObjectId(req.params.id);
const files = await gfsBucket.find({ _id: fileId }).toArray();
if (!files.length) return res.status(404).send('Файл удален');
const file = files[0];
res.set({
'Content-Type': file.contentType,
'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
'Cache-Control': 'public, max-age=31536000'
});
gfsBucket.openDownloadStream(fileId).pipe(res);
} catch (e) { res.status(400).send('Ошибка ID'); }
});

io.on('connection', (socket) => {
socket.on('join', async ({ user, room }) => {
socket.join(room);
const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50).lean();
socket.emit('history', history);
});
socket.on('message', async (data) => {
const m = new Msg(data);
io.to(data.room).emit('renderMsg', { ...data, _id: m._id });
await m.save().catch(e => console.log("Ошибка сохранения:", e));
});
socket.on('deleteMsg', async ({ id, room, fileId }) => {
try {
await Msg.findByIdAndDelete(id);
if (fileId) gfsBucket.delete(new mongoose.Types.ObjectId(fileId)).catch(() => {});
io.to(room).emit('msgDeleted', id);
} catch (e) {}
});
});server.listen(process.env.PORT || 10000, '0.0.0.0', () => console.log(`v10.2 LIVE`));