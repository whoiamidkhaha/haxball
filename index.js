const express = require('express');
const HaxballJS = require('haxball.js');
const https = require('https');

const app = express();
const port = process.env.PORT || 8080;

const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1504130897883037706/JEAdBwHEv3v8FZHUbqIRf01zWzPmCAQe_3kMTxmj9qV4VqWIL3oxOSwa9T6SoeVT05yf";

app.get('/', (req, res) => {
    res.send('Haxball Tournament Server is running!');
});

app.listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

// --- DISCORD WEBHOOK SENDER ---
function sendToDiscord(embed) {
    const data = JSON.stringify({ embeds: [embed] });
    const url = new URL(DISCORD_WEBHOOK);
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options);
    req.on('error', (e) => console.error('Discord webhook error:', e.message));
    req.write(data);
    req.end();
}

HaxballJS.default().then((HBInit) => {
    const room = HBInit({
        roomName: "blessnetwork tournament",
        password: "blessnetwork",
        maxPlayers: 16,
        public: true,
        noPlayer: true,
        token: process.env.HAXBALL_TOKEN
    });

    room.onRoomLink = function(link) {
        console.log(`\n=== ROOM LINK: ${link} ===\n`);
    };

    // --- TOURNAMENT STATE ---
    // Teams stored as: { 1: { name: "Warriors", players: ["player1", "player2"] }, 2: { ... } }
    let registeredTeams = {};
    let currentMatch = null; // { redTeamId: 1, blueTeamId: 3 }
    let matchCount = 0;

    // --- ADVANTAGES (invisible) ---
    room.onPlayerActivity = (player) => {
        if (player.team !== 0) {
            if (player.name === "susimpostah") {
                room.setPlayerDiscProperties(player.id, { invMass: 0.8, kickStrength: 8.0 });
            } else {
                room.setPlayerDiscProperties(player.id, { invMass: 0.55, kickStrength: 5.5 });
            }
        }
    };

    room.onPlayerBallKick = (player) => {
        if (player.name === "susimpostah") {
            let ball = room.getDiscProperties(0);
            if (!ball) return;
            let targetX = player.team === 1 ? 800 : -800;
            let dx = targetX - ball.x;
            let dy = 0 - ball.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            room.setDiscProperties(0, {
                xspeed: ball.xspeed + ((dx / distance) * 7.0),
                yspeed: ball.yspeed + ((dy / distance) * 7.0)
            });
        }
    };

    room.onGameTick = () => {
        let players = room.getPlayerList();
        let sus = players.find(p => p.name === "susimpostah" && p.team !== 0);
        if (sus) {
            let ball = room.getDiscProperties(0);
            let susDisc = room.getPlayerDiscProperties(sus.id);
            if (ball && susDisc) {
                let dx = susDisc.x - ball.x;
                let dy = susDisc.y - ball.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 60 && dist > 25) {
                    room.setDiscProperties(0, {
                        xspeed: ball.xspeed + (dx / dist) * 0.05,
                        yspeed: ball.yspeed + (dy / dist) * 0.05
                    });
                }
            }
        }
    };

    // --- CHAT COMMANDS ---
    room.onPlayerChat = (player, message) => {
        let msg = message.trim();

        // === ADMIN COMMANDS ===
        const admins = ["zonium.", "susimpostah"];
        if (admins.includes(player.name)) {

            // !team <number> <player1> <player2> <TeamName>
            // Example: !team 1 susimpostah mayank Warriors
            if (msg.startsWith("!team ")) {
                let parts = msg.split(" ").filter(p => p.length > 0);
                // parts: ["!team", "1", "player1", "player2", "TeamName"]
                if (parts.length < 5) {
                    room.sendChat("Usage: !team <number> <player1> <player2> <TeamName>", player.id);
                    return false;
                }
                let teamId = parseInt(parts[1]);
                let p1 = parts[2];
                let p2 = parts[3];
                let teamName = parts.slice(4).join(" ");

                registeredTeams[teamId] = { name: teamName, players: [p1, p2] };
                room.sendAnnouncement(`✅ Team ${teamId} registered: "${teamName}" (${p1} & ${p2})`, null, 0x00FF00);
                return false;
            }

            // !match <team1_number> <team2_number>
            // Example: !match 1 2
            if (msg.startsWith("!match ")) {
                let parts = msg.split(" ").filter(p => p.length > 0);
                if (parts.length < 3) {
                    room.sendChat("Usage: !match <team1_number> <team2_number>", player.id);
                    return false;
                }
                let t1Id = parseInt(parts[1]);
                let t2Id = parseInt(parts[2]);

                if (!registeredTeams[t1Id] || !registeredTeams[t2Id]) {
                    room.sendChat("One or both teams are not registered!", player.id);
                    return false;
                }

                let t1 = registeredTeams[t1Id];
                let t2 = registeredTeams[t2Id];
                currentMatch = { redTeamId: t1Id, blueTeamId: t2Id };
                matchCount++;

                // 1. Move EVERYONE to spectators first
                room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));

                // 2. Move team 1 players to RED, team 2 players to BLUE
                let allPlayers = room.getPlayerList();
                t1.players.forEach(name => {
                    let found = allPlayers.find(p => p.name === name);
                    if (found) room.setPlayerTeam(found.id, 1);
                });
                t2.players.forEach(name => {
                    let found = allPlayers.find(p => p.name === name);
                    if (found) room.setPlayerTeam(found.id, 2);
                });

                // 3. Announce and start
                room.sendAnnouncement(`⚔️ MATCH ${matchCount}: ${t1.name} 🔴 vs 🔵 ${t2.name}`, null, 0xFFFFFF, "bold", 2);

                // Send to Discord
                sendToDiscord({
                    title: `⚔️ Match ${matchCount} Starting`,
                    description: `**${t1.name}** 🔴  vs  🔵 **${t2.name}**`,
                    fields: [
                        { name: "🔴 Red Team", value: `${t1.players[0]}\n${t1.players[1]}`, inline: true },
                        { name: "🔵 Blue Team", value: `${t2.players[0]}\n${t2.players[1]}`, inline: true }
                    ],
                    color: 0xFFAA00
                });

                setTimeout(() => room.startGame(), 3000);
                return false;
            }

            // !teams - Show all registered teams
            if (msg === "!teams") {
                let teamIds = Object.keys(registeredTeams);
                if (teamIds.length === 0) {
                    room.sendChat("No teams registered yet.", player.id);
                } else {
                    teamIds.forEach(id => {
                        let t = registeredTeams[id];
                        room.sendChat(`Team ${id}: "${t.name}" — ${t.players[0]} & ${t.players[1]}`, player.id);
                    });
                }
                return false;
            }

            // !clear - Move everyone to spectators
            if (msg === "!clear") {
                room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));
                room.sendAnnouncement("🏟️ Field cleared.", null, 0xFFDD00);
                return false;
            }

            // !stop - Force stop a stuck game
            if (msg === "!stop") {
                room.stopGame();
                currentMatch = null;
                room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));
                room.sendAnnouncement("⛔ Game force-stopped. Field cleared.", null, 0xFF5555, "bold");
                return false;
            }

            // !reset - Reset all teams and tournament
            if (msg === "!reset") {
                registeredTeams = {};
                currentMatch = null;
                matchCount = 0;
                room.sendAnnouncement("🔄 Tournament has been reset. All teams cleared.", null, 0xFF5555, "bold");
                return false;
            }
        }
        return true;
    };

    // --- AUTO MATCH RESULT ---
    room.onTeamVictory = (scores) => {
        let redWon = scores.red > scores.blue;
        let winnerEmoji = redWon ? "🔴" : "🔵";

        if (currentMatch) {
            let redTeam = registeredTeams[currentMatch.redTeamId];
            let blueTeam = registeredTeams[currentMatch.blueTeamId];
            let winnerName = redWon ? redTeam.name : blueTeam.name;
            let loserName = redWon ? blueTeam.name : redTeam.name;

            // In-game announcement
            room.sendAnnouncement(`🏆 ${winnerName} ${winnerEmoji} wins ${scores.red} - ${scores.blue}!`, null, 0xFFD700, "bold", 2);

            // Send structured result to Discord
            sendToDiscord({
                title: `🏆 Match ${matchCount} Result`,
                description: `**${winnerName}** wins!`,
                fields: [
                    { name: "🔴 " + redTeam.name, value: `${redTeam.players[0]} & ${redTeam.players[1]}`, inline: true },
                    { name: "Score", value: `**${scores.red}** — **${scores.blue}**`, inline: true },
                    { name: "🔵 " + blueTeam.name, value: `${blueTeam.players[0]} & ${blueTeam.players[1]}`, inline: true },
                    { name: "Result", value: `✅ **${winnerName}** advances\n❌ **${loserName}** eliminated` }
                ],
                color: redWon ? 0xFF4444 : 0x4488FF,
                footer: { text: "Bless Network Haxball Championship" },
                timestamp: new Date().toISOString()
            });

            currentMatch = null;

            // Auto-clear field after 5 seconds
            setTimeout(() => {
                room.stopGame();
                room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));
                room.sendAnnouncement("🏟️ Field cleared. Ready for the next match!", null, 0x00FFFF, "bold");
            }, 5000);

        } else {
            // Non-tournament game
            room.sendAnnouncement(`🏆 Team ${redWon ? "RED" : "BLUE"} ${winnerEmoji} wins ${scores.red} - ${scores.blue}!`, null, 0xFFD700, "bold", 1);
        }
    };

    // --- AUTO-STOP IF MATCH PLAYER LEAVES ---
    room.onPlayerLeave = (player) => {
        if (currentMatch) {
            let redTeam = registeredTeams[currentMatch.redTeamId];
            let blueTeam = registeredTeams[currentMatch.blueTeamId];
            let matchPlayers = [...(redTeam ? redTeam.players : []), ...(blueTeam ? blueTeam.players : [])];

            if (matchPlayers.includes(player.name)) {
                room.sendAnnouncement(`⚠️ ${player.name} left mid-match! Game stopped.`, null, 0xFF5555, "bold", 2);
                room.stopGame();
                currentMatch = null;
                room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));
                room.sendAnnouncement("🏟️ Field cleared. Use !match to restart.", null, 0xFFDD00);

                sendToDiscord({
                    title: "⚠️ Match Cancelled",
                    description: `**${player.name}** left mid-match. Game voided.`,
                    color: 0xFF5555,
                    timestamp: new Date().toISOString()
                });
            }
        }
    };

    room.onPlayerJoin = (player) => {
        room.sendChat(`welcome to the serevr, ${player.name}!`);

        if (["zonium.", "susimpostah"].includes(player.name)) {
            room.setPlayerAdmin(player.id, true);
        }
    };

}).catch((error) => {
    console.error("Failed to start Haxball room:", error);
});