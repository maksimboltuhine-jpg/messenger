const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// Вставь свою ссылку СЮДА (внутри кавычек)
const MONGO_URI = 'ТВОЯ_ССЫЛКА_ИЗ_MONGODB';

// Настройка подключения (теперь раздельно и с обработкой ошибок)
mongoose.connect(MONGO_URI)
.then(() => {
console.log("--- СИСТЕМА ---");
console.log("База данных: ПОДКЛЮЧЕНА");
})
.catch((err) => {
console.log("--- ОШИБКА БАЗЫ ---");
console.log(err.message);
});

const User = mongoose.model('User', new mongoose.Schema({ username: String, pass: String }));
const Message = mongoose.model('Message', new mongoose.Schema({ room: String, user: String, text: String, time: { type: Date, default: Date.now } }));

app.use(express.static(__dirname));

io.on('connection', (socket) => {
let currentUser = null;
let currentRoom = null;

socket.on('login', async (data) => {
try {
let user = await User.findOne({ username: data.username });
if (!user) {
user = new User({ username: data.username, pass: data.pass });
await user.save();
socket.emit('login_success', user.username);
} else if (user.pass === data.pass) {
socket.emit('login_success', user.username);
} else {
socket.emit('login_error', 'Неверный пароль!');
return;
}
currentUser = user.username;
} catch (e) {
socket.emit('login_error', 'Ошибка базы данных');
}
});

socket.on('join_room', async (room) => {
if (currentRoom) socket.leave(currentRoom);
currentRoom = room || 'general';
socket.join(currentRoom);
const history = await Message.find({ room: currentRoom }).sort({ time: 1 }).limit(50);
socket.emit('history', history);
});

socket.on('chat_message', async (text) => {
if (!currentUser || !currentRoom) return;
const msg = new Message({ room: currentRoom, user: currentUser, text: text });
await msg.save();
io.to(currentRoom).emit('chat_message', msg);
});
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
console.log("---------------------------");
console.log("Сервер запущен на порту: " + PORT);
console.log("---------------------------");
});