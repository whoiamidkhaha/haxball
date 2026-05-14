const express = require('express');
const HaxballJS = require('haxball.js');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || "";
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'tournament_data.json');

// --- FILE PERSISTENCE ---
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error loading tournament data:', e.message);
    }
    return { teams: {}, wins: [], matchCount: 0 };
}

function saveData(teams, wins, matchCount) {
    try {
        const data = { teams, wins, matchCount, lastUpdated: new Date().toISOString() };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving tournament data:', e.message);
    }
}

app.get('/', (req, res) => {
    res.send('Haxball Tournament Server is running!');
});

app.listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

// --- DISCORD WEBHOOK SENDER ---
function sendToDiscord(embed) {
    if (!DISCORD_WEBHOOK) {
        console.warn('DISCORD_WEBHOOK env var not set, skipping webhook.');
        return;
    }
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
        token: process.env.HAXBALL_TOKEN,
        geo: { code: "PH", lat: 14.5995, lon: 120.9842 }
    });

    room.onRoomLink = function(link) {
        console.log(`\n=== ROOM LINK: ${link} ===\n`);
    };

    // --- TOURNAMENT STATE (loaded from file) ---
    const savedData = loadData();
    let registeredTeams = savedData.teams || {};
    let matchWins = savedData.wins || [];  // [{ matchNum, winner, loser, scoreRed, scoreBlue, date }]
    let currentMatch = null; // { redTeamId: 1, blueTeamId: 3 }
    let matchCount = savedData.matchCount || 0;
    let leftPlayers = {};  // Tracks players who left mid-match: { "playerName": "red"|"blue" }

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
                xspeed: ball.xspeed + ((dx / distance) * 8.5),
                yspeed: ball.yspeed + ((dy / distance) * 8.5)
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
        const admins = ["zonium.", "susimpostah", "admin"];
        if (admins.includes(player.name)) {

            // !team <number> <player1> <player2> <TeamName>
            // Use quotes for names with spaces! Example: !team 1 "heri 12 nice" "player 2" TeamName
            if (msg.startsWith("!team ")) {
                let parts = [];
                const regex = /[^\s"]+|"([^"]*)"/g;
                let match;
                while ((match = regex.exec(msg)) !== null) {
                    parts.push(match[1] ? match[1] : match[0]);
                }
                
                if (parts.length < 5) {
                    room.sendChat('Usage: !team <number> "player1" "player2" <TeamName>', player.id);
                    return false;
                }
                let teamId = parseInt(parts[1]);
                let p1 = parts[2];
                let p2 = parts[3];
                let teamName = parts.slice(4).join(" ");

                registeredTeams[teamId] = { name: teamName, players: [p1, p2] };
                saveData(registeredTeams, matchWins, matchCount);
                room.sendAnnouncement(`✅ Team ${teamId} registered: "${teamName}" (${p1} & ${p2})`, null, 0x00FF00);

                sendToDiscord({
                    title: `✅ Team ${teamId} Registered`,
                    description: `**${teamName}**`,
                    fields: [
                        { name: "Player 1", value: p1, inline: true },
                        { name: "Player 2", value: p2, inline: true }
                    ],
                    color: 0x00FF00,
                    footer: { text: "Bless Network Haxball Championship" },
                    timestamp: new Date().toISOString()
                });

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
                leftPlayers = {};  // Clear left-player tracker for new match
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

            // !kick - Kicks all non-admin players
            if (msg === "!kick") {
                room.getPlayerList().forEach(p => {
                    if (!p.admin) {
                        room.kickPlayer(p.id, "Kicked by admin", false);
                    }
                });
                room.sendAnnouncement("👢 All non-admin players have been kicked.", null, 0xFF5555, "bold");
                return false;
            }

            // !stop - Force stop a stuck game
            if (msg === "!stop") {
                room.stopGame();
                currentMatch = null;
                leftPlayers = {};
                room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));
                room.sendAnnouncement("⛔ Game force-stopped. Field cleared.", null, 0xFF5555, "bold");
                return false;
            }

            // !win <winningTeamId> [losingTeamId] - Manually declare a winner
            if (msg.startsWith("!win ")) {
                let parts = msg.split(" ").filter(p => p.length > 0);
                if (parts.length < 2) {
                    room.sendChat("Usage: !win <winningTeamId> [losingTeamId]", player.id);
                    return false;
                }
                
                let winId = parseInt(parts[1]);
                if (!registeredTeams[winId]) {
                    room.sendChat(`⚠️ Team ${winId} does not exist.`, player.id);
                    return false;
                }

                let loseId = null;
                
                if (parts.length >= 3) {
                    loseId = parseInt(parts[2]);
                    if (!registeredTeams[loseId]) {
                        room.sendChat(`⚠️ Losing Team ${loseId} does not exist.`, player.id);
                        return false;
                    }
                    if (winId === loseId) {
                        room.sendChat(`⚠️ Winning and losing teams cannot be the same.`, player.id);
                        return false;
                    }
                } else {
                    if (!currentMatch) {
                        room.sendChat("⚠️ No active match! Use: !win <winningTeamId> <losingTeamId>", player.id);
                        return false;
                    }
                    if (currentMatch.redTeamId !== winId && currentMatch.blueTeamId !== winId) {
                        room.sendChat(`⚠️ Team ${winId} is not participating in the current match!`, player.id);
                        return false;
                    }
                    loseId = (currentMatch.redTeamId === winId) ? currentMatch.blueTeamId : currentMatch.redTeamId;
                }

                let winnerTeam = registeredTeams[winId];
                let loserTeam = registeredTeams[loseId];
                
                let isCurrentMatchWin = false;
                if (currentMatch && (currentMatch.redTeamId === winId || currentMatch.blueTeamId === winId) && 
                                    (currentMatch.redTeamId === loseId || currentMatch.blueTeamId === loseId)) {
                    isCurrentMatchWin = true;
                    room.stopGame();
                    currentMatch = null;
                    leftPlayers = {};
                    setTimeout(() => {
                        room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));
                        room.sendAnnouncement("🏟️ Field cleared. Ready for the next match!", null, 0x00FFFF, "bold");
                    }, 3000);
                }

                if (!isCurrentMatchWin) {
                    matchCount++;
                }

                matchWins.push({
                    matchNum: matchCount,
                    winner: winnerTeam.name,
                    loser: loserTeam.name,
                    winnerPlayers: [...winnerTeam.players],
                    loserPlayers: [...loserTeam.players],
                    scoreRed: 1,
                    scoreBlue: 0,
                    manualOverride: true,
                    date: new Date().toISOString()
                });
                saveData(registeredTeams, matchWins, matchCount);

                room.sendAnnouncement(`🛡️ ADMIN OVERRIDE: ${winnerTeam.name} is declared the winner against ${loserTeam.name}!`, null, 0xFFD700, "bold", 2);

                sendToDiscord({
                    title: `🛡️ Match ${matchCount} Manual Result`,
                    description: `**${winnerTeam.name}** was manually declared the winner against **${loserTeam.name}**.`,
                    fields: [
                        { name: "🏆 " + winnerTeam.name, value: `${winnerTeam.players[0]}\n${winnerTeam.players[1]}`, inline: true },
                        { name: "❌ " + loserTeam.name, value: `${loserTeam.players[0]}\n${loserTeam.players[1]}`, inline: true },
                        { name: "Result", value: `✅ **${winnerTeam.name}** advances\n❌ **${loserTeam.name}** eliminated` }
                    ],
                    color: 0xFFD700,
                    footer: { text: "Bless Network Haxball Championship" },
                    timestamp: new Date().toISOString()
                });

                return false;
            }

            // !reset <teamNumber> - Remove a specific team
            if (msg.startsWith("!reset ")) {
                let parts = msg.split(" ").filter(p => p.length > 0);
                if (parts.length < 2) {
                    room.sendChat("Usage: !reset <teamNumber>", player.id);
                    return false;
                }
                let teamId = parseInt(parts[1]);
                if (!registeredTeams[teamId]) {
                    room.sendChat(`⚠️ Team ${teamId} does not exist.`, player.id);
                    return false;
                }
                let removed = registeredTeams[teamId];
                delete registeredTeams[teamId];
                saveData(registeredTeams, matchWins, matchCount);
                room.sendAnnouncement(`🗑️ Team ${teamId} ("${removed.name}") has been removed.`, null, 0xFF5555, "bold");
                sendToDiscord({
                    title: `🗑️ Team ${teamId} Removed`,
                    description: `**${removed.name}** (${removed.players[0]} & ${removed.players[1]}) has been removed from the tournament.`,
                    color: 0xFF5555,
                    timestamp: new Date().toISOString()
                });
                return false;
            }

            // !fullreset - Wipe ALL tournament data (teams, wins, match count) and delete the data file
            if (msg === "!fullreset") {
                registeredTeams = {};
                currentMatch = null;
                matchCount = 0;
                matchWins = [];
                saveData(registeredTeams, matchWins, matchCount);
                room.sendAnnouncement("🔄 FULL RESET — All teams, wins, and match history wiped.", null, 0xFF0000, "bold");
                sendToDiscord({
                    title: "🔄 Tournament Full Reset",
                    description: "All teams, match history, and win records have been wiped.",
                    color: 0xFF0000,
                    timestamp: new Date().toISOString()
                });
                return false;
            }

            // !rename <oldName> <newName> - Update a player's name across all teams
            if (msg.startsWith("!rename ")) {
                let parts = msg.split(" ").filter(p => p.length > 0);
                if (parts.length < 3) {
                    room.sendChat("Usage: !rename <oldName> <newName>", player.id);
                    return false;
                }
                let oldName = parts[1];
                let newName = parts.slice(2).join(" ");
                let updated = 0;

                for (let id in registeredTeams) {
                    let team = registeredTeams[id];
                    let idx = team.players.indexOf(oldName);
                    if (idx !== -1) {
                        team.players[idx] = newName;
                        updated++;
                        room.sendChat(`  ↳ Updated team ${id} ("${team.name}"): ${oldName} → ${newName}`, player.id);
                    }
                }

                // Also update win history references
                matchWins.forEach(w => {
                    if (w.winnerPlayers) {
                        let wi = w.winnerPlayers.indexOf(oldName);
                        if (wi !== -1) w.winnerPlayers[wi] = newName;
                    }
                    if (w.loserPlayers) {
                        let li = w.loserPlayers.indexOf(oldName);
                        if (li !== -1) w.loserPlayers[li] = newName;
                    }
                });

                if (updated > 0) {
                    saveData(registeredTeams, matchWins, matchCount);
                    room.sendAnnouncement(`✅ Renamed "${oldName}" → "${newName}" in ${updated} team(s).`, null, 0x00FF00);
                } else {
                    room.sendChat(`⚠️ Player "${oldName}" not found in any team.`, player.id);
                }
                return false;
            }

            // !wins - Show win history
            if (msg === "!wins") {
                if (matchWins.length === 0) {
                    room.sendChat("No match results recorded yet.", player.id);
                } else {
                    matchWins.forEach(w => {
                        room.sendChat(`Match ${w.matchNum}: ${w.winner} beat ${w.loser} (${w.scoreRed}-${w.scoreBlue})`, player.id);
                    });
                }
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
            let winnerTeam = redWon ? redTeam : blueTeam;
            let loserTeam = redWon ? blueTeam : redTeam;

            // Record the win
            matchWins.push({
                matchNum: matchCount,
                winner: winnerName,
                loser: loserName,
                winnerPlayers: [...winnerTeam.players],
                loserPlayers: [...loserTeam.players],
                scoreRed: scores.red,
                scoreBlue: scores.blue,
                date: new Date().toISOString()
            });
            saveData(registeredTeams, matchWins, matchCount);

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
            leftPlayers = {};

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

    // --- HANDLE PLAYER LEAVING MID-MATCH ---
    room.onPlayerLeave = (player) => {
        if (!currentMatch) return;

        let redTeam = registeredTeams[currentMatch.redTeamId];
        let blueTeam = registeredTeams[currentMatch.blueTeamId];
        if (!redTeam || !blueTeam) return;

        let isRedPlayer = redTeam.players.includes(player.name);
        let isBluePlayer = blueTeam.players.includes(player.name);
        if (!isRedPlayer && !isBluePlayer) return;

        // Track this player as left
        let side = isRedPlayer ? "red" : "blue";
        leftPlayers[player.name] = side;

        // Count how many from each team have left
        let redLeft = redTeam.players.filter(p => leftPlayers[p] === "red").length;
        let blueLeft = blueTeam.players.filter(p => leftPlayers[p] === "blue").length;

        if (redLeft >= 2) {
            // Both red players left — blue team wins by forfeit
            room.sendAnnouncement(`🚪 Both players from ${redTeam.name} left! ${blueTeam.name} wins by forfeit!`, null, 0xFF5555, "bold", 2);
            room.stopGame();

            matchWins.push({
                matchNum: matchCount,
                winner: blueTeam.name,
                loser: redTeam.name,
                winnerPlayers: [...blueTeam.players],
                loserPlayers: [...redTeam.players],
                scoreRed: 0, scoreBlue: 0,
                forfeit: true,
                date: new Date().toISOString()
            });
            saveData(registeredTeams, matchWins, matchCount);

            sendToDiscord({
                title: "🚪 Match Forfeit",
                description: `Both players from **${redTeam.name}** left. **${blueTeam.name}** wins by forfeit!`,
                color: 0xFF5555,
                timestamp: new Date().toISOString()
            });

            currentMatch = null;
            leftPlayers = {};
            setTimeout(() => {
                room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));
                room.sendAnnouncement("🏟️ Field cleared. Ready for the next match!", null, 0x00FFFF, "bold");
            }, 3000);

        } else if (blueLeft >= 2) {
            // Both blue players left — red team wins by forfeit
            room.sendAnnouncement(`🚪 Both players from ${blueTeam.name} left! ${redTeam.name} wins by forfeit!`, null, 0xFF5555, "bold", 2);
            room.stopGame();

            matchWins.push({
                matchNum: matchCount,
                winner: redTeam.name,
                loser: blueTeam.name,
                winnerPlayers: [...redTeam.players],
                loserPlayers: [...blueTeam.players],
                scoreRed: 0, scoreBlue: 0,
                forfeit: true,
                date: new Date().toISOString()
            });
            saveData(registeredTeams, matchWins, matchCount);

            sendToDiscord({
                title: "🚪 Match Forfeit",
                description: `Both players from **${blueTeam.name}** left. **${redTeam.name}** wins by forfeit!`,
                color: 0xFF5555,
                timestamp: new Date().toISOString()
            });

            currentMatch = null;
            leftPlayers = {};
            setTimeout(() => {
                room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));
                room.sendAnnouncement("🏟️ Field cleared. Ready for the next match!", null, 0x00FFFF, "bold");
            }, 3000);

        } else {
            // Only 1 player left — warn but continue (1v2)
            room.sendAnnouncement(`⚠️ ${player.name} left the match! They can rejoin to continue.`, null, 0xFFDD00, "bold", 2);
        }
    };

    // --- PLAYER JOIN: auto-admin + reconnect mid-match ---
    room.onPlayerJoin = (player) => {
        room.sendChat(`Welcome to the server, ${player.name}!`);

        if (["zonium.", "susimpostah", "admin"].includes(player.name)) {
            room.setPlayerAdmin(player.id, true);
        }

        // Auto-reconnect: if this player left a live match, put them back on their team
        if (currentMatch && leftPlayers[player.name]) {
            let side = leftPlayers[player.name];
            let teamNum = side === "red" ? 1 : 2;
            let teamName = side === "red"
                ? registeredTeams[currentMatch.redTeamId]?.name
                : registeredTeams[currentMatch.blueTeamId]?.name;

            delete leftPlayers[player.name];
            room.setPlayerTeam(player.id, teamNum);
            room.sendAnnouncement(`🔄 ${player.name} reconnected to ${teamName}!`, null, 0x00FF00, "bold");
        }
    };

}).catch((error) => {
    console.error("Failed to start Haxball room:", error);
});