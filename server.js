const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
// Character database - 24 unique characters with real images
// Using diverse avatar API for realistic character images
const CHARACTERS = [
  { id: 1, name: 'Alex', image: 'https://i.pravatar.cc/200?img=1', traits: ['glasses', 'beard', 'hat'] },
  { id: 2, name: 'Bailey', image: 'https://i.pravatar.cc/200?img=2', traits: ['glasses', 'hat'] },
  { id: 3, name: 'Casey', image: 'https://i.pravatar.cc/200?img=3', traits: ['beard'] },
  { id: 4, name: 'Dakota', image: 'https://i.pravatar.cc/200?img=4', traits: ['glasses', 'smile'] },
  { id: 5, name: 'Emerson', image: 'https://i.pravatar.cc/200?img=5', traits: ['hat', 'beard'] },
  { id: 6, name: 'Finley', image: 'https://i.pravatar.cc/200?img=6', traits: ['glasses'] },
  { id: 7, name: 'Grace', image: 'https://i.pravatar.cc/200?img=7', traits: ['smile'] },
  { id: 8, name: 'Harper', image: 'https://i.pravatar.cc/200?img=8', traits: ['hat'] },
  { id: 9, name: 'Indigo', image: 'https://i.pravatar.cc/200?img=9', traits: ['beard', 'smile'] },
  { id: 10, name: 'Jordan', image: 'https://i.pravatar.cc/200?img=10', traits: ['glasses', 'beard', 'smile'] },
  { id: 11, name: 'Kinley', image: 'https://i.pravatar.cc/200?img=11', traits: [] },
  { id: 12, name: 'Logan', image: 'https://i.pravatar.cc/200?img=12', traits: ['hat', 'smile'] },
  { id: 13, name: 'Morgan', image: 'https://i.pravatar.cc/200?img=13', traits: ['glasses', 'smile'] },
  { id: 14, name: 'Noelle', image: 'https://i.pravatar.cc/200?img=14', traits: ['beard', 'hat'] },
  { id: 15, name: 'Oscar', image: 'https://i.pravatar.cc/200?img=15', traits: ['glasses', 'hat'] },
  { id: 16, name: 'Parker', image: 'https://i.pravatar.cc/200?img=16', traits: ['smile'] },
  { id: 17, name: 'Quinn', image: 'https://i.pravatar.cc/200?img=17', traits: ['beard'] },
  { id: 18, name: 'Riley', image: 'https://i.pravatar.cc/200?img=18', traits: ['glasses', 'beard'] },
  { id: 19, name: 'Sage', image: 'https://i.pravatar.cc/200?img=19', traits: ['hat', 'smile'] },
  { id: 20, name: 'Taylor', image: 'https://i.pravatar.cc/200?img=20', traits: ['glasses', 'smile'] },
  { id: 21, name: 'Unique', image: 'https://i.pravatar.cc/200?img=21', traits: ['hat', 'beard', 'smile'] },
  { id: 22, name: 'Vesper', image: 'https://i.pravatar.cc/200?img=22', traits: ['glasses', 'hat', 'smile'] },
  { id: 23, name: 'Walker', image: 'https://i.pravatar.cc/200?img=23', traits: ['beard', 'smile'] },
  { id: 24, name: 'Zara', image: 'https://i.pravatar.cc/200?img=24', traits: ['glasses', 'hat', 'beard'] }
];

// Game state management
const games = new Map(); // roomId -> gameState
const players = new Map(); // socketId -> playerInfo
const waitingPlayers = []; // Queue of waiting players

/**
 * Game state structure:
 * {
 *   roomId: string,
 *   player1: { socketId, username, secretCharacterId, flippedCards, ready },
 *   player2: { socketId, username, secretCharacterId, flippedCards, ready },
 *   currentTurn: 'player1' | 'player2',
 *   questionHistory: [{ player, question, answer, timestamp }, ...],
 *   gameStatus: 'waiting' | 'playing' | 'finished',
 *   winner: socketId | null,
 *   lastAction: timestamp
 * }
 */

// Utility functions
function generateRoomId() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function getRandomCharacter() {
  return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
}

function createGameState(roomId, player1Info) {
  const secretChar1 = getRandomCharacter();
  return {
    roomId,
    player1: {
      socketId: player1Info.socketId,
      username: player1Info.username,
      secretCharacterId: secretChar1.id,
      secretCharacterName: secretChar1.name,
      flippedCards: new Set(),
      ready: false
    },
    player2: null,
    currentTurn: 'player1',
    questionHistory: [],
    gameStatus: 'waiting',
    winner: null,
    lastAction: Date.now()
  };
}

// Socket.io event handlers
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Player joins queue for matchmaking
  socket.on('join_queue', (username) => {
    console.log(`${username} (${socket.id}) joined matchmaking queue`);
    
    players.set(socket.id, { username, socketId: socket.id });

    // Try to find an opponent
    if (waitingPlayers.length > 0) {
      const opponent = waitingPlayers.shift();
      const roomId = generateRoomId();
      
      // Create game
      const gameState = createGameState(roomId, opponent);
      gameState.player2 = {
        socketId: socket.id,
        username: username,
        secretCharacterId: getRandomCharacter().id,
        secretCharacterName: getRandomCharacter().name,
        flippedCards: new Set(),
        ready: false
      };
      gameState.gameStatus = 'playing';
      
      games.set(roomId, gameState);

      // Add both players to the room
      opponent.socket.join(roomId);
      socket.join(roomId);

      console.log(`Game started: ${roomId} - ${opponent.username} vs ${username}`);

      // Notify both players
      io.to(roomId).emit('game_found', {
        roomId,
        player1: {
          socketId: gameState.player1.socketId,
          username: gameState.player1.username
        },
        player2: {
          socketId: gameState.player2.socketId,
          username: gameState.player2.username
        },
        characters: CHARACTERS.map(c => ({ id: c.id, name: c.name })),
        currentTurn: gameState.currentTurn
      });
    } else {
      // Add to waiting queue
      waitingPlayers.push({ socket, username, socketId: socket.id });
      socket.emit('waiting_for_opponent', {
        message: 'Waiting for an opponent...',
        queuePosition: waitingPlayers.length
      });
    }
  });

  // Create private room with custom ID
  socket.on('create_room', (data) => {
    const { username, roomId } = data;
    
    players.set(socket.id, { username, socketId: socket.id, roomId });
    
    const gameState = createGameState(roomId, { socketId: socket.id, username });
    games.set(roomId, gameState);
    
    socket.join(roomId);
    
    socket.emit('room_created', {
      roomId,
      message: `Room created! Share this room ID with your friend: ${roomId}`
    });
    
    console.log(`Room created: ${roomId} by ${username}`);
  });

  // Join existing private room
  socket.on('join_room', (data) => {
    const { username, roomId } = data;
    
    const game = games.get(roomId);
    
    if (!game) {
      socket.emit('join_room_error', { message: 'Room not found!' });
      return;
    }
    
    if (game.player2) {
      socket.emit('join_room_error', { message: 'Room is full!' });
      return;
    }

    players.set(socket.id, { username, socketId: socket.id, roomId });
    
    game.player2 = {
      socketId: socket.id,
      username: username,
      secretCharacterId: getRandomCharacter().id,
      secretCharacterName: getRandomCharacter().name,
      flippedCards: new Set(),
      ready: false
    };
    game.gameStatus = 'playing';
    
    socket.join(roomId);

    console.log(`Player ${username} joined room ${roomId}`);

    io.to(roomId).emit('game_found', {
      roomId,
      player1: {
        socketId: game.player1.socketId,
        username: game.player1.username
      },
      player2: {
        socketId: game.player2.socketId,
        username: game.player2.username
      },
      characters: CHARACTERS.map(c => ({ id: c.id, name: c.name })),
      currentTurn: game.currentTurn
    });
  });

  // Player flips a card (locally, just for visualization)
  socket.on('flip_card', (data) => {
    const { roomId, cardId } = data;
    const game = games.get(roomId);
    
    if (!game) return;

    // Determine which player
    const isPlayer1 = game.player1.socketId === socket.id;
    const player = isPlayer1 ? game.player1 : game.player2;
    
    if (!player) return;

    // Track flipped cards
    if (player.flippedCards.has(cardId)) {
      player.flippedCards.delete(cardId);
    } else {
      player.flippedCards.add(cardId);
    }

    // Broadcast flip to both players
    io.to(roomId).emit('card_flipped', {
      playerSocketId: socket.id,
      cardId,
      flippedCards: Array.from(player.flippedCards)
    });
  });

  // Ask a question
  socket.on('ask_question', (data) => {
    const { roomId, question } = data;
    const game = games.get(roomId);
    
    if (!game) return;

    const isPlayer1 = game.player1.socketId === socket.id;
    const asker = isPlayer1 ? game.player1 : game.player2;
    const responder = isPlayer1 ? game.player2 : game.player1;

    // Only the current turn player can ask
    const currentPlayerKey = game.currentTurn === 'player1' ? 'player1' : 'player2';
    if (game[currentPlayerKey].socketId !== socket.id) {
      socket.emit('error', { message: 'Not your turn!' });
      return;
    }

    // Notify responder to answer
    io.to(responder.socketId).emit('question_asked', {
      question,
      askerName: asker.username,
      askerSocketId: socket.id
    });

    game.lastAction = Date.now();
  });

  // Answer a question
  socket.on('answer_question', (data) => {
    const { roomId, answer, askerSocketId } = data;
    const game = games.get(roomId);
    
    if (!game) return;

    const isPlayer1 = game.player1.socketId === socket.id;
    const answerer = isPlayer1 ? game.player1 : game.player2;
    const asker = isPlayer1 ? game.player2 : game.player1;

    // Add to question history
    const lastQuestion = game.questionHistory[game.questionHistory.length - 1];
    if (lastQuestion && !lastQuestion.answer) {
      lastQuestion.answer = answer;
      lastQuestion.answerer = answerer.username;
    }

    // Broadcast answer
    io.to(roomId).emit('question_answered', {
      answer,
      answerer: answerer.username,
      answererSocketId: socket.id
    });

    // Switch turn
    game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';
    io.to(roomId).emit('turn_changed', { currentTurn: game.currentTurn });

    game.lastAction = Date.now();
  });

  // Store question in history (called after answer)
  socket.on('store_question', (data) => {
    const { roomId, question, answer, asker, answerer } = data;
    const game = games.get(roomId);
    
    if (!game) return;

    game.questionHistory.push({
      question,
      answer,
      asker,
      answerer,
      timestamp: Date.now()
    });
  });

  // Make a guess
  socket.on('make_guess', (data) => {
    const { roomId, guessCharacterId } = data;
    const game = games.get(roomId);
    
    if (!game) return;

    const isPlayer1 = game.player1.socketId === socket.id;
    const guesser = isPlayer1 ? game.player1 : game.player2;
    const opponent = isPlayer1 ? game.player2 : game.player1;

    const isCorrect = guessCharacterId === opponent.secretCharacterId;

    if (isCorrect) {
      game.winner = socket.id;
      game.gameStatus = 'finished';
      
      io.to(roomId).emit('game_finished', {
        winner: socket.id,
        winnerName: guesser.username,
        correctCharacter: opponent.secretCharacterName,
        guessWasCorrect: true
      });

      console.log(`${guesser.username} won in room ${roomId}`);
    } else {
      io.to(roomId).emit('game_finished', {
        loser: socket.id,
        loserName: guesser.username,
        correctCharacter: opponent.secretCharacterName,
        guessWasCorrect: false
      });

      console.log(`${guesser.username} lost in room ${roomId}`);
    }

    game.lastAction = Date.now();
  });

  // Restart game
  socket.on('restart_game', (data) => {
    const { roomId } = data;
    const game = games.get(roomId);
    
    if (!game) return;

    // Reset game state
    game.player1.secretCharacterId = getRandomCharacter().id;
    game.player1.secretCharacterName = getRandomCharacter().name;
    game.player1.flippedCards.clear();
    
    game.player2.secretCharacterId = getRandomCharacter().id;
    game.player2.secretCharacterName = getRandomCharacter().name;
    game.player2.flippedCards.clear();
    
    game.questionHistory = [];
    game.currentTurn = 'player1';
    game.gameStatus = 'playing';
    game.winner = null;

    io.to(roomId).emit('game_restarted', {
      currentTurn: game.currentTurn,
      characters: CHARACTERS.map(c => ({ id: c.id, name: c.name }))
    });

    console.log(`Game restarted in room ${roomId}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    const player = players.get(socket.id);
    
    if (player && player.roomId) {
      const game = games.get(player.roomId);
      
      if (game) {
        // Notify other player
        io.to(player.roomId).emit('opponent_left', {
          message: 'Your opponent has disconnected.'
        });

        // Clean up game
        games.delete(player.roomId);
      }
    } else {
      // Remove from waiting queue
      const index = waitingPlayers.findIndex(p => p.socketId === socket.id);
      if (index !== -1) {
        waitingPlayers.splice(index, 1);
      }
    }

    players.delete(socket.id);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✨ Guess Who Game Server running on port ${PORT}`);
  console.log(`🌐 Access the game at: http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready for real-time gameplay\n`);
});
