const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// Твои данные из скриншота
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:nmH7ay41x3f7SL2b@cluster0.mongodb.net/messenger?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
.then(() => console.log("--- ПОДКЛЮЧЕНО К БАЗЕ ---"))
.catch((err) => console.log("ОШИБКА БАЗЫ: " + err.message));

const User = mongoose.model('User', new mongoose.Schema({ username: String, pass: String }));
const Message = mongoose.model('Message', new mongoose.Schema({ room: String, user: String, text: String, time: { type: Date, default: Date.now } }));

app.use(express.static(__dirname));

io.on('connection', (socket) => {
let currentUser = null;
socket.on('login', async (data) => {
try {
let user = await User.findOne({ username: data.username });
if (!user) {
user = new User({ username: data.username, pass: data.pass });
await user.save();
} else if (user.pass !== data.pass) {
return socket.emit('login_error', 'Неверный пароль');
}
currentUser = user.username;
socket.emit('login_success', user.username);
} catch (e) { socket.emit('login_error', 'Ошибка БД'); }
});

socket.on('join_room', async (room) => {
socket.join(room || 'Общий');
const history = await Message.find({ room: room || 'Общий' }).sort({ time: 1 }).limit(50);
socket.emit('history', history);
});

socket.on('chat_message', async (data) => {
if (!currentUser) return;
const msg = new Message({ room: data.room || 'Общий', user: currentUser, text: data.text });
await msg.save();
io.to(data.room || 'Общий').emit('chat_message', msg);
});
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log("Сервер запущен на порту: " + PORT));