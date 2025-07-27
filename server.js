const WebSocket = require('ws');
const express = require('express');
const port = process.env.PORT || 3000;


const wss = new WebSocket.Server({ noServer: true });

// Store rooms and their data (text content)
let rooms = {};

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New client connected');
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        if (data.action === 'create-room') {
            // Create new room
            if (rooms[data.roomName]) {
                ws.send(JSON.stringify({ error: 'Room already exists. Please choose a different name.' }));
                return;
            }
            
            rooms[data.roomName] = { 
                clients: [ws], 
                content: '', 
                createdAt: new Date() 
            };
            
            ws.send(JSON.stringify({ 
                action: 'room-created', 
                roomName: data.roomName 
            }));
            
            console.log(`Room ${data.roomName} created`);
            
        } else if (data.action === 'join-room') {
            // Join an existing room
            const room = rooms[data.roomName];
            if (room) {
                // Check if user is already in the room
                if (!room.clients.includes(ws)) {
                    room.clients.push(ws);
                }
                
                ws.send(JSON.stringify({ 
                    action: 'load-content', 
                    content: room.content,
                    roomName: data.roomName
                }));
                
                ws.send(JSON.stringify({ 
                    action: 'room-joined', 
                    roomName: data.roomName 
                }));
                
                console.log(`Client joined room ${data.roomName} (${room.clients.length} users online)`);
                
                // Notify all clients in the room about user count
                room.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                            action: 'user-count-update', 
                            count: room.clients.length 
                        }));
                    }
                });
            } else {
                ws.send(JSON.stringify({ error: 'Room not found. Please check the room code.' }));
            }
            
        } else if (data.action === 'update-content') {
            // Update room content
            const room = rooms[data.roomName];
            if (room) {
                room.content = data.content;
                room.lastUpdated = new Date();
                
                // Broadcast to all other clients in the room
                room.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                            action: 'update-content', 
                            content: data.content 
                        }));
                    }
                });
                
                console.log(`Content updated in room ${data.roomName}`);
            }
        }
    });
    
    // Remove the client from room on disconnect
    ws.on('close', () => {
        console.log('Client disconnected');
        for (let roomName in rooms) {
            const room = rooms[roomName];
            const initialCount = room.clients.length;
            room.clients = room.clients.filter(client => client !== ws);
            
            // If user count changed, notify remaining clients
            if (room.clients.length !== initialCount) {
                room.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                            action: 'user-count-update', 
                            count: room.clients.length 
                        }));
                    }
                });
                
                console.log(`User left room ${roomName} (${room.clients.length} users remaining)`);
                
                // Delete empty rooms after 5 minutes
                if (room.clients.length === 0) {
                    setTimeout(() => {
                        if (rooms[roomName] && rooms[roomName].clients.length === 0) {
                            delete rooms[roomName];
                            console.log(`Empty room ${roomName} deleted`);
                        }
                    }, 5 * 60 * 1000); // 5 minutes
                }
            }
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Serve static files (HTML, CSS, JS)
app.use(express.static('public'));

// API endpoint to get room info (optional)
app.get('/api/room/:roomName/info', (req, res) => {
    const roomName = req.params.roomName;
    const room = rooms[roomName];
    
    if (room) {
        res.json({
            roomName,
            userCount: room.clients.length,
            createdAt: room.createdAt,
            lastUpdated: room.lastUpdated
        });
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

// API endpoint to get server stats (optional)
app.get('/api/stats', (req, res) => {
    const totalRooms = Object.keys(rooms).length;
    const totalUsers = Object.values(rooms).reduce((sum, room) => sum + room.clients.length, 0);
    
    res.json({
        totalRooms,
        totalUsers,
        rooms: Object.keys(rooms).map(roomName => ({
            name: roomName,
            userCount: rooms[roomName].clients.length,
            createdAt: rooms[roomName].createdAt
        }))
    });
});

// Handle dynamic room access
app.get('/room/:roomName', (req, res) => {
    const roomName = req.params.roomName;
    res.sendFile(__dirname + '/public/index.html');
});

// Default route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Handle WebSocket upgrade
app.server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Collaborative notepad server ready!');
});

app.server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Server shutting down...');
    wss.close(() => {
        app.server.close(() => {
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('Server shutting down...');
    wss.close(() => {
        app.server.close(() => {
            process.exit(0);
        });
    });
});
