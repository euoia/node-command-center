// TODO: Not sure whether it's better to store references to the jQuery objects
// or just store the selector string.

define(['jquery', 'underscore', 'socket.io'], function($, _, io) {
	function Chat(options) {
		$this = this;

		// TODO: Handle multiple rooms AT THE SAME TIME.
		this.username = options.username;
		this.roomName = options.roomName;
		this.commands = options.commands;
		this.userListDiv = $(options.userListDiv);
		this.messagesUl = $(options.messagesUl);
		this.messageScroll = $(options.messageScroll);
		this.messageEntryForm = $(options.messageEntryForm);
		this.messageEntry = $(options.messageEntry);
		this.socket = null;
		this.roomUserList = null; // UL of users in room.

		console.log('new chat, roomName: ' + this.roomName);

		// Bind to the message entry form.
		this.messageEntryForm.submit(function() {
			$this.handleMessageInput.call($this);
			return false;
		});

		// Init user list HMTL.
		$this.initUserList();
	}

	Chat.prototype.connect = function(roomName) {
		this.roomName = roomName;
		console.log('connecting, this.roomName: ' + this.roomName);


		if (this.socket === null) {
			console.log('connecting for the first time');
			this.socket = io.connect('http://localhost');
			this.listen();
		} else {
			console.log('reconnecting');
			this.socket.socket.reconnect();
		}

	};

	Chat.prototype.disconnect = function() {
		console.log('disconnect');
		this.socket.disconnect();
	};

	// Set up socket listeners.
	Chat.prototype.listen = function() {
		if (this.roomName === undefined) {
			alert('Cannot listen without a room name');
		}

		var $this = this;

		// Upon connecting with the socket.
		this.socket.on('connect', function() {
			$this.socket.emit('subscribe', {
				roomName: $this.roomName
			});
		});

		// Receive a user list for a room.
		this.socket.on('userList', function(data) {
			$this.updateUserList(data.users);
		});

		// Receive a message.
		// Note that data.roomName is optional.
		this.socket.on('message', function(data) {
			$this.addMessage(data.time, data.username, data.message);
		});

		// Receive a notification.
		// Note that data.roomName is optional.
		this.socket.on('notification', function(data) {
			$this.addNotification(data.time, data.username, data.message);
		});
	};

	Chat.prototype.initUserList = function(users) {
		$('<div class="roomName">' + this.roomName + ' users</div>')
			.appendTo(this.userListDiv);

		this.roomUserList = $('<ul id="roomUserList" />').appendTo(this.userListDiv);
	};

	Chat.prototype.updateUserList = function(users) {
		this.roomUserList.html('');

		for (i in users) {
			$('<li class="username">' + users[i] + '</li>').appendTo('#roomUserList');
		}
	};

	Chat.prototype.sendMessage = function(message) {
		console.log('sendMessage');
		this.socket.emit('message', {
			message: message,
			roomName: this.roomName
		});

		// We add our message directly since the server will not echo it back to us.
		$this.addMessage(Date.now(), this.username, message);
	};

	Chat.prototype.addMessage = function(time, username, message) {
		this.messagesUl.append(
			"<li class='message'>" +
			"<span class='timestamp'>[" + this.formatDate(time) + "] </span>" +
			"<span class='username'>" + username + ": </span>" +
			"<span class='message'>" + message + "</span>" +
			"</li>");

		this.scrollDown();
	};

	Chat.prototype.addNotification = function(time, username, message) {
		this.messagesUl.append(
			"<li class='notification'>" +
			"<span class='timestamp'>[" + this.formatDate(time) + "] </span>" +
			"<span class='notification'>" + message + "</span>" +
			"</li>");

		this.scrollDown();
	};

	Chat.prototype.formatDate = function(dateStr) {
		var d = new Date(dateStr);

		return this.formatNumberLength(d.getHours(), 2) +
			":" + this.formatNumberLength(d.getMinutes(), 2);
	};

	Chat.prototype.formatNumberLength = function(num, length) {
		var r = "" + num;
		while (r.length < length) {
			r = "0" + r;
		}

		return r;
	};

	Chat.prototype.scrollDown = function() {
		var $this = this;

		//used to keep the most recent messages visible
		this.messageScroll.animate({
			scrollTop: 9999
		}, 400);

		//clear the animation otherwise the user cannot scroll back up.
		setTimeout(function clearAnimate() {
			$this.messageScroll.animate({}, 1);
		});
	};

	Chat.prototype.handleMessageInput = function() {
		var message = this.messageEntry.val(),
			command = null;

		this.messageEntry.val('');

		if (message.charAt(0) === '/') {
			// A command!
			command = message.substr(1);
			if (this.commands[command] !== undefined && typeof(this.commands[command]) === 'function') {
				this.commands[command]();
			} else {
				this.addMessage(Date.now(), 'admin', 'Not a valid command');
			}
		} else {
			this.sendMessage(message);
		}
	};

	Chat.prototype.refreshUserList = function() {
		this.socket.emit('userList', {
			roomName: this.roomName
		});
	};

	Chat.prototype.destroy = function() {
		this.userListDiv.html('');
	};

	Chat.prototype.logout = function() {
		this.disconnect();
	};

	// TODO: We should be able to add this command from a separate game module.
	Chat.prototype.listGames = function () {
		this.socket.emit('listGames');
	};

	return Chat;
});
