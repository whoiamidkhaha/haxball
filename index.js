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
        token: process.env.HAXBALL_TOKEN // We will set this in Railway
    }, {
        storage: {
            player_name: "HostBot",
            avatar: "🤖"
        },
        onOpen: (room) => {
            console.log('\n=== HEADLESS ROOM OPENED ===\n');

            room.onAfterRoomLink = (roomLink) => {
                console.log(`\n=== ROOM LINK: ${roomLink} ===\n`);
            };

            // 1. Give yourself a slight advantage when you spawn
            room.onPlayerActivity = (player) => {
                // Change "YourName" to your actual Haxball username!
                if (player.name === "susimpostah" && player.team !== 0) {
                    // Give a slight advantage (Aim Assist & Speed)
                    // Normal radius is 15. We make you slightly bigger so you hit the ball easier.
                    // Normal invMass is 0.5. We make it 0.55 so you accelerate slightly faster than others.
                    room.setPlayerDiscProperties(player.id, {
                        radius: 16,        // Slightly larger = easier to hit the ball (Aim assist)
                        invMass: 0.55,     // Slightly faster acceleration
                        kickStrength: 5.5  // Slightly harder kicks (Normal is 5)
                    });
                }
            };

            // 2. Secret Admin Commands
            room.onPlayerChat = (player, message) => {
                // Change "YourName" to your actual Haxball username!
                if (player.name === "YourName") {
                    
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