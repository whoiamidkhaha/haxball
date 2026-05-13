const express = require('express');
const HaxballJS = require('haxball.js');

// 1. Setup a dummy web server so Railway's health checks pass
const app = express();
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.send('Haxball Modded Server is running!');
});

app.listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

// 2. Initialize the Haxball Room
HaxballJS.default().then((HBInit) => {
    const room = HBInit({
        roomName: "blessnetwork tournament",
        password: "blessnetwork",
        maxPlayers: 16,
        public: true,
        noPlayer: true, // The host is not a physical player
        token: process.env.HAXBALL_TOKEN 
    });

    room.onRoomLink = function(link) {
        console.log(`\n=== ROOM LINK: ${link} ===\n`);
    };

    // 1. Game Speed Settings & Invisible Advantage
    room.onPlayerActivity = (player) => {
        if (player.team !== 0) {
            if (player.name === "susimpostah") {
                // MASSIVE BUFF for susimpostah
                room.setPlayerDiscProperties(player.id, {
                    invMass: 0.8,      // WAY faster acceleration
                    kickStrength: 8.0  // Cannon kicks
                });
            } else {
                // SLIGHT BUFF for everyone else
                room.setPlayerDiscProperties(player.id, {
                    invMass: 0.55,     
                    kickStrength: 5.5  
                });
            }
        }
    };

    // 1.5. Real Aim Assist (Magnetic Goal)
    room.onPlayerBallKick = (player) => {
        if (player.name === "susimpostah") {
            let ball = room.getDiscProperties(0); 
            if (!ball) return;

            let targetX = player.team === 1 ? 800 : -800; 
            let targetY = 0; 

            let dx = targetX - ball.x;
            let dy = targetY - ball.y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            let dirX = dx / distance;
            let dirY = dy / distance;

            // Stronger magnetic push towards the goal
            room.setDiscProperties(0, {
                xspeed: ball.xspeed + (dirX * 7.0),
                yspeed: ball.yspeed + (dirY * 7.0)
            });
        }
    };

    // 1.8. Dribble Magnet (Sticks to feet)
    room.onGameTick = () => {
        // Find susimpostah in the room
        let players = room.getPlayerList();
        let sus = players.find(p => p.name === "susimpostah" && p.team !== 0);
        
        if (sus) {
            let ball = room.getDiscProperties(0);
            let susDisc = room.getPlayerDiscProperties(sus.id);
            
            if (ball && susDisc) {
                let dx = susDisc.x - ball.x;
                let dy = susDisc.y - ball.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                
                // If the ball is close (within 60 distance units), gently pull it toward susimpostah
                if (dist < 60 && dist > 25) {
                    room.setDiscProperties(0, {
                        xspeed: ball.xspeed + (dx / dist) * 0.05,
                        yspeed: ball.yspeed + (dy / dist) * 0.05
                    });
                }
            }
        }
    };

    // 2. Secret Admin Commands (zonium ONLY)
    room.onPlayerChat = (player, message) => {
        if (player.name === "zonium.") {
            if (message === "!win") {
                room.sendAnnouncement("Admin used secret powers! 🪄", null, 0xFF00FF, "bold");
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

        if (player.name === "zonium.") {
            room.setPlayerAdmin(player.id, true);
            room.sendChat("Admin recognized. Commands enabled. 🤫", player.id); 
        }
        
        if (player.name === "susimpostah") {
            room.sendChat("Buffs active. 🤫", player.id);
        }
    };

}).catch((error) => {
    console.error("Failed to start Haxball room:", error);
});