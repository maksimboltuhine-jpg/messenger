const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// МАКСИМАЛЬНО УПРОЩЕННАЯ ССЫЛКА
// Пароль: Messenger12345 (убедись, что в Atlas он именно такой)
const MONGO_URI = 'mongodb://maksimboltuhine_db_user:Messenger12345@cluster0-shard-00-00.p8qzvcu.mongodb.net:27017,cluster0-shard-00-01.p8qzvcu.mongodb.net:27017,cluster0-shard-00-02.p8qzvcu.mongodb.net:27017/messenger?ssl=true&authSource=admin';

mongoose.connect(MONGO_URI, {
useNewUrlParser: true,
useUnifiedTopology: true,
serverSelectionTimeoutMS: 10000 // Ждем 10 секунд перед ошибкой
})
.then(() => console.log("--- ПОДКЛЮЧЕНО К MONGODB УСПЕШНО ---"))
.catch((err) => {
console.log("--- ОШИБКА ПОДКЛЮЧЕНИЯ К БАЗЕ ---");
console.log("Текст ошибки:", err.message);
});

// Схема данных
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
socket.emit('login_error', 'Ошибка БД: ' + e.message);
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
http.listen(PORT, () => console.log("Сервер запущен на порту: " + PORT));