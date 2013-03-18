var sio = require('socket.io'),
	SessionSockets = require('session.socket.io'),
	_ = require('underscore');

// Adds the following keys to the session:
// rooms - An array of room names that the session is currently present in.
//         This is used for rejoining when the client sends a checkSession request.

Chat = function(server, sessionStore, cookieParser) {
	var $this = this;

	// Array of socket events that can be handled.
	// TODO: Reduce the LOC.
	this.socketEvents  = {
		'subscribe': function(socket, session, data) {
			console.log('subscribe');
			console.log(data);
			if (data.roomName === undefined) {
				console.log(session.username + ' tried to subscribe but did not specify a room name.');
				return;
			}

			console.log(session.username + ' joined ' + data.roomName);

			var usernamesInRoomBeforeJoining = _.pluck($this.io.sockets.clients(data.roomName), 'username');

			// Add the socket to the room.
			socket.join(data.roomName);

			// Add the room name to the session.
			if (_.contains(session.rooms, data.roomName) === false) {
				session.rooms.push(data.roomName);
				session.save();
			}

			var usernamesInRoomAfterJoining = _.pluck($this.io.sockets.clients(data.roomName), 'username');

			// Send the user list to the socket.
			// A user may have multiple sockets open so we need the unique list of usernames.
			$this.emitUserList(socket, data.roomName, _.uniq(usernamesInRoomAfterJoining));

			// If already present, the socket needs to join, but do not notify the room.
			if (_.contains(usernamesInRoomBeforeJoining, socket.username)) {
				socket.emit('message', {
					time: Date.now(),
					username: 'admin',
					roomName: data.roomName,
					message: 'You have rejoined ' + data.roomName + '.'
				});

			} else {
				socket.emit('message', {
					time: Date.now(),
					username: 'admin',
					roomName: data.roomName,
					message: 'You have joined ' + data.roomName + '.'
				});

				socket.broadcast.to(data.roomName).emit('message', {
					time: Date.now(),
					username: 'admin',
					roomName: data.roomName,
					message: session.username + ' has joined ' + data.roomName + '.'
				});

				$this.broadcastUserList(socket, data.roomName, _.uniq(usernamesInRoomAfterJoining));
			}
		},
		'unsubscribe': function(socket, session, data) {
			if (data.roomName === undefined) {
				console.log(session.username + ' tried to unsubscribe but did not specify a roomName so the request is being discarded');
				console.log(data);
				return;
			}

			console.log(session.username + ' unsubscribed ' + data.roomName);
			socket.leave(data.roomName);

			socket.broadcast.to(data.roomName).emit('message', {
				time: Date.now(),
				username: 'admin',
				roomName: data.roomName,
				message: session.username + ' has unsubscribed ' + data.roomName + '.'
			});
		},
		'disconnect': function(socket, session) {
			// Note that this event is fired before the socket is removed from the room
			// list.
			console.log(session.username + ' disconnected.');

			// TODO: Is there a way to get rooms without accessing a private member (socket.manager)?
			var room = null,
				socketRoomName = null,
				timesInRoom = 0,
				rooms = socket.manager.roomClients[socket.id];

			usernamesInRoom = null;

			for (socketRoomName in rooms) {
				// Strip the socket.io leading '/'.
				room = socketRoomName.substr(1);

				usernamesInRoom = _.pluck($this.io.sockets.clients(room), 'username');
				usernamesInRoomAfterLeaving = _.without(usernamesInRoom, socket.username);

				timesInRoom = usernamesInRoom.length - usernamesInRoomAfterLeaving.length;

				// Only display the disconnect message if this is the last socket the
				// user has open to the room.
				if (timesInRoom === 1) {
					socket.broadcast.to(room).emit('message', {
						time: Date.now(),
						username: 'admin',
						roomName: room,
						message: session.username + ' has disconnected from ' + room + '.'
					});

					console.log('$this:');
					console.log($this);
					$this.broadcastUserList(socket, room, _.uniq(usernamesInRoomAfterLeaving));
				}
			};
		},
		'message': function(socket, session, data) {
			console.log('message');
			console.log(data);

			// TODO: This kind of checking and logging is probably OTT. We could have some kind of separate validation module.
			if (data.roomName === undefined) {
				console.log(session.username + ' sent a message but did not specify a room name so it is being discarded.');
				console.log(data);
				return;
			}

			if (data.message === undefined) {
				console.log(session.username + ' sent a message but did not specify a message so it is being discarded.');
				console.log(data);
				return;
			}

			console.log(session.username + ' sent a message:');
			console.log(data);

			socket.broadcast.to(data.roomName).emit('message', {
				time: Date.now(),
				username: session.username,
				roomName: data.roomName,
				message: data.message
			});
		},
		'userList': function(socket, session, data) {
			if (data.roomName === undefined) {
				console.log(session.username + ' requested userList but did not specify a room name so it is being discarded.');
				console.log(data);
				return;
			}
			console.log(session.username + ' requested userList.');

			var users = _.pluck($this.io.sockets.clients(data.roomName), 'username');
			console.log(users);

			$this.emitUserList(socket, data.roomName, users);
		}
	};

	this.io = sio.listen(server);
	this.sessionSockets = new SessionSockets(this.io, sessionStore, cookieParser),
	this.setupListeners();
}

Chat.prototype.setupListeners = function() {
	var $this = this;

	this.sessionSockets.on('connection', function(err, socket, session) {
	console.log('socket connection');
		if (err) {
			throw err;
		}

		// Bind events.
		for (event in $this.socketEvents) {
			console.log('Bound ' + event);
			socket.on(event, $this.socketEvents[event].bind(this, socket, session));
		}

		socket.username = session.username;
	});
};

Chat.prototype.emitUserList = function(socket, roomName, userList) {
	socket.emit('userList', {
		roomName: roomName,
		users: userList
	});
};

Chat.prototype.broadcastUserList = function(socket, roomName, userList) {
	socket.broadcast.to(roomName).emit('userList', {
		roomName: roomName,
		users: userList
	});
};

// Allow the client code to add additional socket events.
Chat.prototype.addSocketEvent = function (event, fn) {
	console.log ('Adding socket event: ' + event);
	this.socketEvents[event] = fn;
};

// ----------------------
// Static methods.
// ----------------------

// Chat.initSession.
// Initialize the express session object.
Chat.initSession = function(session) {
	console.log('initSession',session);
	session.rooms = [];
};

module.exports = Chat;
