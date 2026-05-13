const nodeHaxball = require('node-haxball')();
const { Room, Utils } = nodeHaxball;

Utils.generateAuth().then(([authKey, authObj]) => {
    Room.create({
        name: "Test Room",
        noPlayer: true
    }, {
        storage: { player_name: "HostBot" },
        onOpen: (room) => {
            console.log("Players in room:", room.players.length);
            process.exit(0);
        }
    });
});
