const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// НОВЫЙ ПАРОЛЬ: Messenger12345
// Если поменял пароль в Atlas, проверь, чтобы здесь он был таким же
const MONGO_URI = 'mongodb://maksimboltuhine_db_user:Messenger12345@cluster0-shard-00-00.p8qzvcu.mongodb.net:27017,cluster0-shard-00-01.p8qzvcu.mongodb.net:27017,cluster0-shard-00-02.p8qzvcu.mongodb.net:27017/messen..';

mongoose.connect(MONGO_URI, {
serverSelectionTimeoutMS: 5000, // Ждать ответа от базы не дольше 5 секунд
connectTimeoutMS: 10000,
})
.then(() => console.log("--- ПОБЕДА: БАЗА ПОДКЛЮЧЕНА ---"))
.catch((err) => {
console.log("--- ОШИБКА ПОДКЛЮЧЕНИЯ ---");
console.log("Сообщение:", err.message);
});

const User = mongoose.model('User', new mongoose.Schema({ username: String, pass: String }));
const Message = mongoose.model('Message', new mongoose.Schema({ room: String, user: String, text: String, time: { type: Date, default: Date.now } }));

app.use(express.static(__dirname));

io.on('connection', (socket) => {
let currentUser = null;
socket.on('login', async (data) => {
try {
if (!data.username || !data.pass) return socket.emit('login_error', 'Поля пусты');
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
socket.emit('login_error', 'База всё еще спит...');
}
});

socket.on('join_room', async (room) => {
socket.join('Общий');
const history = await Message.find({ room: 'Общий' }).sort({ time: 1 }).limit(50);
socket.emit('history', history);
});

socket.on('chat_message', async (text) => {
if (!currentUser) return;
const msg = new Message({ room: 'Общий', user: currentUser, text: text });
await msg.save();
io.to('Общий').emit('chat_message', msg);
});
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log("Сервер онлайн на порту " + PORT));