const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// Подключение к базе данных MongoDB
const MONGO_URI = 'ТВОЯ_ССЫЛКА_ИЗ_MONGODB';
mongoose.connect(MONGO_URI)
.then(() => console.log('База данных успешно подключена!'))
.catch(err => console.log('Ошибка подключения к БД:', err));

// Создаем "Схемы" для базы данных
const UserSchema = new mongoose.Schema({ username: String, pass: String });
const User = mongoose.model('User', UserSchema);

const MsgSchema = new mongoose.Schema({ room: String, user: String, text: String, time: { type: Date, default: Date.now } });
const Message = mongoose.model('Message', MsgSchema);

app.use(express.static(__dirname));

io.on('connection', (socket) => {
let currentUser = null;
let currentRoom = null;

// Регистрация и Авторизация
socket.on('login', async (data) => {
let user = await User.findOne({ username: data.username });
if (!user) {
// Если пользователя нет - создаем нового (Регистрация)
user = new User({ username: data.username, pass: data.pass });
await user.save();
socket.emit('login_success', user.username);
} else if (user.pass === data.pass) {
// Если есть и пароль совпал - пускаем
socket.emit('login_success', user.username);
} else {
// Неверный пароль
socket.emit('login_error', 'Неверный пароль или логин занят!');
return;
}
currentUser = user.username;
});

// Вход в группу (комнату)
socket.on('join_room', async (room) => {
if (currentRoom) socket.leave(currentRoom);
currentRoom = room || 'general';
socket.join(currentRoom);

// Достаем историю сообщений этой группы из базы (последние 50 штук)
const history = await Message.find({ room: currentRoom }).sort({ time: 1 }).limit(50);
socket.emit('history', history);
});

// Отправка сообщения
socket.on('chat_message', async (text) => {
if (!currentUser || !currentRoom) return;
// Сохраняем в базу
const msg = new Message({ room: currentRoom, user: currentUser, text: text });
await msg.save();
// Рассылаем всем в текущей группе
io.to(currentRoom).emit('chat_message', msg);
});
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
console.log(`Сервер запущен на порту ${PORT}`);
});