const express = require('express');
const HaxballJS = require('haxball.js');

// 1. Setup a dummy web server so Railway's health checks pass
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Haxball Server is running!');
});

app.listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

// 2. Initialize the Haxball Room
HaxballJS.then((HBInit) => {
    const room = HBInit({
        roomName: "My Railway Haxball Server",
        maxPlayers: 16,
        public: true,
        noPlayer: true, // The host is not a player
        token: process.env.HAXBALL_TOKEN // We will set this in Railway
    });

    room.onRoomLink = function(link) {
        console.log(`\n=== ROOM LINK: ${link} ===\n`);
    };

    room.onPlayerJoin = function(player) {
        room.sendAnnouncement(`Welcome to the server, ${player.name}!`, null, 0x00FF00, "bold", 1);
    };

    // Add any custom bot logic here!
}).catch((error) => {
    console.error("Failed to start Haxball room:", error);
});