const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// СТАРЫЙ ФОРМАТ ССЫЛКИ (БЕЗ SRV) - САМЫЙ НАДЕЖНЫЙ
const MONGO_URI = 'mongodb://maksimboltuhine_db_user:Messenger12345@ac-8vdrglj-shard-00-00.peuxhxx.mongodb.net:27017,ac-8vdrglj-shard-00-01.peuxhxx.mongodb.net:27017,ac-8vdrglj-shard-00-02.peuxhxx.mongodb.net:27017/mess..';

const connectWithRetry = () => {
console.log('--- ПОПЫТКА ПОДКЛЮЧЕНИЯ К БАЗЕ... ---');
mongoose.connect(MONGO_URI)
.then(() => console.log("--- ПОБЕДА: БАЗА ДАННЫХ НА СВЯЗИ! ---"))
.catch((err) => {
console.log("--- КРИТИЧЕСКАЯ ОШИБКА БАЗЫ ---");
console.log("Текст:", err.message);
setTimeout(connectWithRetry, 5000);
});
};

connectWithRetry();

// Модели
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
} catch (e) {
socket.emit('login_error', 'База все еще спит...');
}
});

socket.on('join_room', async () => {
socket.join('Общий');
try {
const history = await Message.find({ room: 'Общий' }).sort({ time: 1 }).limit(50);
socket.emit('history', history);
} catch (e) { console.log("Ошибка истории"); }
});

socket.on('chat_message', async (text) => {
if (!currentUser) return;
try {
const msg = new Message({ room: 'Общий', user: currentUser, text: text });
await msg.save();
io.to('Общий').emit('chat_message', msg);
} catch (e) { console.log("Ошибка сохранения"); }
});
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log(`Сервер работает на порту: ${PORT}`));