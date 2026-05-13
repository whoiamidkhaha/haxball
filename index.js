const express = require('express');
const nodeHaxball = require('node-haxball')();
const { Room, Utils } = nodeHaxball;

// 1. Setup a dummy web server so Railway's health checks pass
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Node-Haxball Modded Server is running!');
});

app.listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

// 2. Initialize the Node-Haxball Modded Room
Utils.generateAuth().then(([authKey, authObj]) => {
    Room.create({
        name: "My Modded Railway Server",
        password: "", // Add a password if you want the room to be private
        showInRoomList: true,
        maxPlayerCount: 16,
        noPlayer: true, // This hides the host from the spectator list!
        token: process.env.HAXBALL_TOKEN // We will set this in Railway
    }, {
        storage: {
            player_name: "mayankalways",
            avatar: "🤖"
        },
        onOpen: (room) => {
            console.log('\n=== HEADLESS ROOM OPENED ===\n');

            room.onAfterRoomLink = (roomLink) => {
                console.log(`\n=== ROOM LINK: ${roomLink} ===\n`);
            };

            // 1. Invisible Advantage (Slightly faster & stronger, but normal size)
            room.onPlayerActivity = (player) => {
                if (player.name === "mayankalways" && player.team !== 0) {
                    // Radius stays normal (15) so nobody can see a difference
                    // We only secretly increase speed and kick strength
                    room.setPlayerDiscProperties(player.id, {
                        invMass: 0.53,     // Very slightly faster (Normal is 0.5)
                        kickStrength: 5.3  // Slightly harder kicks (Normal is 5)
                    });
                }
            };

            // 1.5. Real Aim Assist (Magnetic Goal)
            room.onPlayerBallKick = (player) => {
                // When you kick the ball, we slightly redirect its velocity towards the enemy goal
                if (player.name === "mayankalways") {
                    let ball = room.getDiscProperties(0); // 0 is always the ball
                    if (!ball) return;

                    // Determine which goal to aim at based on your team
                    // Team 1 (Red) aims right (+X), Team 2 (Blue) aims left (-X)
                    let targetX = player.team === 1 ? 800 : -800; 
                    let targetY = 0; // Center of the goal

                    // Calculate direction to the goal
                    let dx = targetX - ball.x;
                    let dy = targetY - ball.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);

                    // Normalize the direction vector
                    let dirX = dx / distance;
                    let dirY = dy / distance;

                    // Add a "magnetic push" towards the goal
                    // We add a subtle vector to the ball's current speed so it perfectly arcs toward the net
                    room.setDiscProperties(0, {
                        xspeed: ball.xspeed + (dirX * 1.5),
                        yspeed: ball.yspeed + (dirY * 1.5)
                    });
                }
            };

            // 2. Secret Admin Commands
            room.onPlayerChat = (player, message) => {
                // Change "YourName" to your actual Haxball username!
                if (player.name === "mayankalways") {
                    
                    if (message === "!win") {
                        // Secretly force the ball into the net
                        room.sendAnnouncement("The Host used their secret powers! 🪄", null, 0xFF00FF, "bold");
                        
                        // Move the ball to an un-saveable position (e.g. high up in the air or off-screen)
                        // Or just stop the game and say you won
                        room.stopGame();
                        room.sendAnnouncement(`${player.name} WINS!`, null, 0x00FF00, "bold", 2);
                        return false; // Hide the "!win" message
                    }

                    if (message === "!super") {
                        // Make yourself ridiculously huge as a joke
                        room.setPlayerDiscProperties(player.id, { radius: 30, kickStrength: 10 });
                        return false; 
                    }
                }
                return true; // Let normal messages pass
            };

            room.onPlayerJoin = (player) => {
                room.sendChat(`Welcome to the Modded Server, ${player.name}!`);
            };
        }
    });
}).catch((error) => {
    console.error("Failed to start node-haxball room:", error);
});