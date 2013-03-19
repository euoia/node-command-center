var sio = require('socket.io'),
	SessionSockets = require('session.socket.io'),
	_ = require('underscore'),
	util = require('util');

// Adds the following keys to the session:
// rooms - An array of room names that the session is currently present in.
//         This is used for rejoining when the client sends a checkSession request.

Chat = function(server, sessionStore, cookieParser) {
	var $this = this;

	// Array of socket events that can be handled.
	this.socketEvents  = {
		'subscribe': function(socket, session, data) {
			if (data.roomName === undefined) {
				console.log('%s sent subscribe but did not specify a roomName.', session.username);
				return;
			}

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
			// A user may have multiple socket connections so we need the unique list of usernames.
			$this.sendUserList(socket, data.roomName);

			// If already present, the socket needs to join, but do not notify the room.
			if (_.contains(usernamesInRoomBeforeJoining, socket.username)) {
				$this.sendNotification(socket, util.format('You have rejoined %s.', data.roomName), data.roomName);
			} else {
				$this.sendNotification(socket, util.format('You have joined %s.', data.roomName), data.roomName);
				$this.sendRoomNotification(socket, data.roomName, util.format('%s has joined %s.', session.username, data.roomName));
				$this.broadcastUserList(socket, data.roomName, _.uniq(usernamesInRoomAfterJoining));
			}

			console.log('%s subscribed to %s.', session.usernane, data.roomName);
		},
		'unsubscribe': function(socket, session, data) {
			if (data.roomName === undefined) {
				console.log(util.format('%s tried to unsubscribe but did not specify a roomName so the request is being discarded', session.username));
				return;
			}

			socket.leave(data.roomName);
			$this.sendRoomNotification(socket, data.roomName, util.format('%s has left %s.', session.username, data.roomName));

			console.log(util.format('%s unsubscribed from %s.', session.username, data.roomName));
		},
		'disconnect': function(socket, session) {
			// This event is fired BEFORE the socket is removed from the room list.

			// TODO: Is there a way to get rooms without accessing a private member (socket.manager)?
			var room = null,
				socketRoomName = null,
				timesInRoom = 0,
				rooms = socket.manager.roomClients[socket.id], // Rooms associated with this socket.
				usernamesInRoom = [],
				usernamesInRoomAfterLeaving = [];

			// For all rooms associated with the socket check if it is the last
			// socket for that room for this user, and if so issue a message to the room.
			for (socketRoomName in rooms) {
				// Strip the socket.io leading '/'.
				room = socketRoomName.substr(1);

				// Determine whether this is the last socket connection this user has to this room.
				usernamesInRoom                = _.pluck($this.io.sockets.clients(room), 'username');
				usernamesInRoomAfterLeaving    = _.without(usernamesInRoom, socket.username);
				timesInRoom                    = usernamesInRoom.length - usernamesInRoomAfterLeaving.length;

				// Only display the disconnect message if this is the last socket the user has open to the room.
				if (timesInRoom === 1) {
					$this.sendRoomNotification(socket, room, util.format('%s has disconnected from %s.', session.username, room));
					$this.broadcastUserList(socket, room, _.uniq(usernamesInRoomAfterLeaving));
				}
			}

			console.log('%s disconnected.', session.username);
		},
		'message': function(socket, session, data) {
			// TODO: This kind of checking and logging is probably OTT. We could have some kind of separate validation module.
			if (data.roomName === undefined) {
				console.log('%s sent a message but did not specify roomName so it is being discarded.', session.username);
				return;
			}

			if (data.message === undefined) {
				console.log('%s sent a message but did not specify message so it is being discarded.', session.username);
				return;
			}

			console.log('%s sent the following message to %s: %s', session.username, data.roomName, data.message);
			$this.sendRoomMessage(socket, data.roomName, session.username, data.message);
		},
		'userList': function(socket, session, data) {
			if (data.roomName === undefined) {
				console.log('%s requested userList but did not specify roomName so it is being discarded.', session.username);
				return;
			}

			console.log('%s requested userList.', session.username);
			$this.sendUserList(socket, data.roomName);
		}
	};

	this.io = sio.listen(server);
	this.sessionSockets = new SessionSockets(this.io, sessionStore, cookieParser);
	this.setupListeners();
};

Chat.prototype.setupListeners = function() {
	var $this = this;

	this.sessionSockets.on('connection', function(err, socket, session) {
		console.log('Chat socket connection.');
		if (err) {
			throw(err);
		}

		// Bind event handlers to the socket.
		for (event in $this.socketEvents) {
			console.log('Bound Chat event to socket: %s.', event);
			socket.on(event, $this.socketEvents[event].bind(this, socket, session));
		}

		// Store anything extra on the socket object.
		socket.username = session.username;
	});
};


// ----------------------
// Emitters.
// ----------------------


// Send the user list of a given room to the socket.
Chat.prototype.sendUserList = function(socket, roomName) {
	var users = _.pluck(this.io.sockets.clients(roomName), 'username');
	users = _.uniq(users);

	socket.emit('userList', {
		roomName: roomName,
		users: users
	});
};

// Send the user list of a given room to the socket.
Chat.prototype.broadcastUserList = function(socket, roomName, userList) {
	socket.broadcast.to(roomName).emit('userList', {
		roomName: roomName,
		users: userList
	});
};

// Send a message from a user to a room; exluding a single socket.
Chat.prototype.sendRoomMessage = function(socket, roomName, usernameFrom, message) {
		socket.broadcast.to(roomName).emit('message', {
			time: Date.now(),
			username: usernameFrom,
			roomName: roomName,
			message: message
		});
};

// Send a direct message from a user to a socket.
//
// roomName is optional - if not specified then the message will appear in all
// room windows.
Chat.prototype.sendMessage = function(socket, usernameFrom, message, roomName) {
	socket.emit('message', {
		time: Date.now(),
		username: usernameFrom,
		message: message,
		roomName: roomName
	});
};

// Send a notification to a room; exluding a single socket.
Chat.prototype.sendRoomNotification = function(socket, roomName, message) {
		socket.broadcast.to(roomName).emit('notification', {
			time: Date.now(),
			roomName: roomName,
			message: message
		});
};

// Send a notification to a socket in a room in a given room.
//
// roomName is optional - if not specified then the message will appear in all
// room windows.
Chat.prototype.sendNotification = function(socket, message, roomName) {
	socket.emit('notification', {
		time: Date.now(),
		message: message,
		roomName: roomName
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
