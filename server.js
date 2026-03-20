const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Память сервера для сообщений
const roomsData = {
'Общий': []
};

app.use(express.static(__dirname));

io.on('connection', (socket) => {
let currentUser = 'Аноним';
let currentRoom = 'Общий';

console.log('Кто-то зашел в сеть');

// Вход
socket.on('set_user', (username) => {
currentUser = username || 'Аноним';
socket.emit('login_success', currentUser);
console.log(`Пользователь ${currentUser} готов к общению`);
});

// Переход в группу
socket.on('join_room', (roomName) => {
socket.leave(currentRoom);
currentRoom = roomName || 'Общий';
socket.join(currentRoom);

if (!roomsData[currentRoom]) {
roomsData[currentRoom] = [];
}

socket.emit('history', roomsData[currentRoom]);
socket.emit('room_changed', currentRoom);
});

// Сообщение
socket.on('chat_message', (text) => {
if (!text) return;

const msg = {
user: currentUser,
text: text,
time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
};

roomsData[currentRoom].push(msg);
// Храним только последние 50 сообщений в каждой группе
if (roomsData[currentRoom].length > 50) roomsData[currentRoom].shift();

io.to(currentRoom).emit('chat_message', msg);
});
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
console.log(`--- ЧАТ ЗАПУЩЕН НА ПОРТУ ${PORT} ---`);
});