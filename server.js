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

// Временная папка для приема файлов (потом перекидываем в БД)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(__dirname));

// МОНГО (ВСТАВЬ СВОЮ ССЫЛКУ!)
const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.mongodb.net/chatDB?retryWrites=true&w=majority';

let gfsBucket; // Переменная для работы с файлами в базе

mongoose.connect(MONGO_URI)
.then(() => {
console.log('✅ База подключена!');
// Инициализируем GridFS для хранения файлов прямо в MongoDB
gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
bucketName: 'uploads'
});
})
.catch(e => console.error('❌ Ошибка базы:', e));

// Настройка приема файлов (сначала на диск, чтобы не жрать ОЗУ)
const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// Загрузка файла: принимаем, льем в БД, удаляем с диска
app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'No file' });

let originalName = req.file.originalname;
try { originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch(e) {}

// Открываем поток для записи в MongoDB
const writeStream = gfsBucket.openUploadStream(originalName, {
contentType: req.file.mimetype
});

// Читаем файл с диска и льем в базу
fs.createReadStream(req.file.path).pipe(writeStream);

writeStream.on('finish', () => {
// Как только файл в базе — удаляем временный с диска
fs.unlinkSync(req.file.path);

res.json({
fileUrl: `/file/${writeStream.id}`, // Новая ссылка на файл из базы
fileId: writeStream.id,
fileType: req.file.mimetype,
fileName: originalName
});
});
});

// Чтение и скачивание файлов прямо из базы данных (Стриминг)
app.get('/file/:id', async (req, res) => {
try {
const { ObjectId } = mongoose.Types;
const fileId = new ObjectId(req.params.id);

// Ищем файл в базе
const files = await gfsBucket.find({ _id: fileId }).toArray();
if (!files || files.length === 0) return res.status(404).send('Файл не найден');

const file = files[0];
const encodedName = encodeURIComponent(file.filename);

// Если передан параметр ?download=1, скачиваем, иначе просто показываем (картинки, видео)
if (req.query.download === '1') {
res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
} else {
res.set('Content-Disposition', `inline; filename*=UTF-8''${encodedName}`);
}

res.set('Content-Type', file.contentType);
res.set('Content-Length', file.length);

// Стримим файл из БД прямиком пользователю
gfsBucket.openDownloadStream(fileId).pipe(res);
} catch (err) {
res.status(500).send('Ошибка при получении файла');
}
});

const msgSchema = new mongoose.Schema({
user: String, text: String, room: String,
fileUrl: String, fileId: String, fileType: String, fileName: String,
date: { type: Date, default: Date.now }
});
const Msg = mongoose.model('Msg', msgSchema);

io.on('connection', (socket) => {socket.on('join', async ({ user, room }) => {
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

socket.on('deleteMsg', async ({ id, room, fileId }) => {
try {
await Msg.findByIdAndDelete(id);
// Если у сообщения был файл, удаляем и его из GridFS
if (fileId) {
gfsBucket.delete(new mongoose.Types.ObjectId(fileId)).catch(e=>console.log(e));
}
io.to(room).emit('msgDeleted', id);
} catch (e) {}
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`v9.0 Cloud Storage ON ${PORT}`));