const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Настройка папки для файлов
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Конфиг загрузки файлов
const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
cb(null, Date.now() + '-' + safeName);
}
});
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).send('Файл не выбран');
res.json({ fileUrl: `/uploads/${req.file.filename}`, fileType: req.file.mimetype });
});

// ПОДКЛЮЧЕНИЕ К БАЗЕ (Вставь свою ссылку!)
const MONGO_URI = 'mongodb+srv://твой_логин:твой_пароль@cluster0.mongodb.net/messenger?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI).then(() => console.log('MongoDB OK')).catch(err => console.log('MongoDB Error:', err));

const messageSchema = new mongoose.Schema({
username: String, text: String, room: String,
fileUrl: String, fileType: String, time: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

io.on('connection', (socket) => {
socket.on('joinRoom', async ({ username, room }) => {
socket.join(room);
const history = await Message.find({ room }).sort({ time: 1 }).limit(50);
socket.emit('history', history);
});

socket.on('chatMessage', async (data) => {
const msg = new Message(data);
await msg.save();
io.to(data.room).emit('message', msg);
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));