const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = require('http').createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

// Allow CORS
app.use(cors());

// Serve simple endpoint for health check
app.get('/', (req, res) => {
  res.send('Dev Socket Server Running');
});

io.on('connection', (socket) => {
  console.log('a user connected');
  
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on('echo', (msg) => {
    console.log('echo:', msg);
    socket.emit('echo', msg);
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Dev socket server listening on port ${PORT}`);
});
