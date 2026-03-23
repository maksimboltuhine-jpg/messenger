const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Увеличиваем лимиты для самого экспресса
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

const MONGO_URI = 'ТВОЯ_ССЫЛКА_ТУТ';

let gfsBucket;

mongoose.connect(MONGO_URI)
.then(() => {
console.log('✅ MongoDB Connected');
gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
})
.catch(e => console.error('❌ MongoDB Connection Error:', e));

// Схема с TTL (удаление через 24 часа)
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
if (!gfsBucket) return res.status(500).json({ error: 'Database not ready' });

let originalName = req.file.originalname;
try { originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch(e) {}

const writeStream = gfsBucket.openUploadStream(originalName, { contentType: req.file.mimetype });
const readStream = fs.createReadStream(req.file.path);

readStream.pipe(writeStream);

writeStream.on('finish', () => {
console.log(`✅ File saved to DB: ${originalName}`);
if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
res.json({
fileUrl: `/file/${writeStream.id}`,
fileId: writeStream.id,
fileType: req.file.mimetype,
fileName: originalName
});
});

writeStream.on('error', (err) => {
console.error('❌ GridFS Error:', err);
if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
res.status(500).json({ error: 'Upload to DB failed' });
});
});

app.get('/file/:id', async (req, res) => {
try {
const fileId = new mongoose.Types.ObjectId(req.params.id);
const files = await gfsBucket.find({ _id: fileId }).toArray();
if (!files.length) return res.status(404).send('File not found or expired');

res.set({
'Content-Type': files[0].contentType,
'Content-Disposition': req.query.download === '1' ? 'attachment' : 'inline'
});
gfsBucket.openDownloadStream(fileId).pipe(res);
} catch (e) { res.status(400).send('Invalid ID'); }
});

io.on('connection', (socket) => {
socket.on('join', async ({ user, room }) => {
socket.join(room);
const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50);
socket.emit('history', history);
});

socket.on('message', (data) => {
const m = new Msg(data);
io.to(data.room).emit('renderMsg', { ...data, _id: m._id });
m.save().catch(e => console.log('Save Error:', e));
});

socket.on('deleteMsg', async ({ id, room, fileId }) => {
try {
await Msg.findByIdAndDelete(id);
if (fileId) gfsBucket.delete(new mongoose.Types.ObjectId(fileId)).catch(() => {});
io.to(room).emit('msgDeleted', id);
} catch (e) {}
});
});

server.listen(process.env.PORT || 10000, '0.0.0.0', () => console.log(`v9.2 System Online`));