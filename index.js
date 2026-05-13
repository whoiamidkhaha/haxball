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
        password: "blessnetwork", // Add a password if you want the room to be private
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

            const adminNames = ["mayankalways", "susimpostah", "zonium"];

            // 1. Game Speed Settings & Invisible Advantage
            room.onPlayerActivity = (player) => {
                if (player.team !== 0) {
                    if (adminNames.includes(player.name)) {
                        // MASSIVE BUFF for you (still looks normal size)
                        room.setPlayerDiscProperties(player.id, {
                            invMass: 0.8,      // WAY faster acceleration (Base game is 0.5)
                            kickStrength: 8.0  // Cannon kicks (Base game is 5.0)
                        });
                    } else {
                        // SLIGHT BUFF for everyone else (makes the game feel less slow)
                        room.setPlayerDiscProperties(player.id, {
                            invMass: 0.55,     // Slightly faster baseline
                            kickStrength: 5.5  // Slightly stronger baseline kicks
                        });
                    }
                }
            };

            // 1.5. Real Aim Assist (Magnetic Goal)
            room.onPlayerBallKick = (player) => {
                if (adminNames.includes(player.name)) {
                    let ball = room.getDiscProperties(0); 
                    if (!ball) return;

                    let targetX = player.team === 1 ? 800 : -800; 
                    let targetY = 0; 

                    let dx = targetX - ball.x;
                    let dy = targetY - ball.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);

                    let dirX = dx / distance;
                    let dirY = dy / distance;

                    // MASSIVE magnetic push towards the goal so you definitely feel it
                    room.setDiscProperties(0, {
                        xspeed: ball.xspeed + (dirX * 5.0),
                        yspeed: ball.yspeed + (dirY * 5.0)
                    });
                }
            };

            // 2. Secret Admin Commands
            room.onPlayerChat = (player, message) => {
                if (adminNames.includes(player.name)) {
                    if (message === "!win") {
                        room.sendAnnouncement("The Host used their secret powers! 🪄", null, 0xFF00FF, "bold");
                        room.stopGame();
                        room.sendAnnouncement(`${player.name} WINS!`, null, 0x00FF00, "bold", 2);
                        return false; 
                    }

                    if (message === "!super") {
                        room.setPlayerDiscProperties(player.id, { radius: 30, kickStrength: 15 });
                        return false; 
                    }
                }
                return true; 
            };

            room.onPlayerJoin = (player) => {
                room.sendChat(`welcome to the serevr, ${player.name}!`);

                if (adminNames.includes(player.name)) {
                    room.setPlayerAdmin(player.id, true);
                    room.sendChat("The true owner has arrived. Buffs applied. 🤫", player.id); 
                }
            };
        }
    });
}).catch((error) => {
    console.error("Failed to start node-haxball room:", error);
});