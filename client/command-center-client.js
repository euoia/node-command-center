// TODO: Not sure whether it's better to store references to the jQuery objects
// or just store the selector string.
//
// TODO: This is really a kind of "command console". Perhaps it would be better
// to separate out the chat functionality into its own module.
//
// TODO: Handle multiple rooms AT THE SAME TIME.
//
// General notes:
//  * This acts as a facade for the socket object through CommandCenter.prototype.emit.
define(['jquery', 'underscore', 'socket.io', 'util'], function($, _, io, Util) {
  function CommandCenter(options) {
    $this = this;

    // jQuery options.
    this.roomUserListDiv = $(options.roomUserListDiv);
    this.messagesUl = $(options.messagesUl);
    this.messageScroll = $(options.messageScroll);
    this.messageEntryForm = $(options.messageEntryForm);
    this.messageEntry = $(options.messageEntry);

    // Initialise this vars.
    this.username = null;
    this.socket = null;
    this.roomUserList = null; // <ul> of users in room.
    this.commands = {};

    // Commands.
    this.addCommand('listCommands', this.listCommands.bind(this));

    // Bind to the message entry form.
    this.messageEntryForm.submit(function() {
      $this.handleMessageInput.call($this);
      return false;
    });

    this.socketEvents = {
      'connect': function() {
        // Upon connecting with the socket.
        $this.emit('subscribe');
      },
      'userList': function(data) {
        // Receive a user list for a room.
        console.log('Received userList.', data);
        $this.updateRoomUserList(data.users);
      },
      'message': function(data) {
        // Receive a message.
        // Note that data.roomName is optional.
        $this.addMessage(data.time, data.username, data.message);
      },
      'notification': function(data) {
        // Receive a notification.
        // Note that data.roomName is optional.
        $this.addNotification(data.time, data.message);
      }
    };

    console.log('new chat, roomName: %s', roomName);
  }

  CommandCenter.prototype.connect = function(username, roomName) {
    this.username = username;
    this.roomName = roomName;

    if (this.socket === null) {
      console.log('connecting for the first time');
      this.socket = io.connect('/');
      this.listen();

      // Init user list HMTL.
      $this.initRoomUserList();
    } else {
      console.log('reconnecting');
      this.socket.socket.reconnect();
    }

  };

  CommandCenter.prototype.disconnect = function() {
    console.log('disconnect');
    this.socket.disconnect();
  };

  // Set up socket listeners.
  CommandCenter.prototype.listen = function() {
    if (this.roomName === undefined) {
      alert('Cannot listen without a room name');
    }

    // Bind event handlers to the socket.
    for (var event in this.socketEvents) {
      this.socket.on(event, this.socketEvents[event].bind(this));
    }

    var $this = this;
  };

  CommandCenter.prototype.initRoomUserList = function(users) {
    $('<div class="roomNameTitle">Players</div>')
      .appendTo(this.roomUserListDiv);

    this.roomUserList = $('<ul id="roomUserList" />').appendTo(this.roomUserListDiv);
  };

  CommandCenter.prototype.updateRoomUserList = function(users) {
    this.roomUserList.html('');

    for (var i in users) {
      $('<li class="username usernameList">' + users[i] + '</li>').appendTo(this.roomUserList);
    }
  };

  // Send a message to the current room.
  CommandCenter.prototype.sendMessage = function(message) {
    console.log('sendMessage');
    this.emit('message', {
      message: message
    });

    // We add our message directly since the server will not echo it back to us.
    $this.addMessage(Date.now(), this.username, message);
  };

  CommandCenter.prototype.addMessage = function(time, username, message) {
    this.messagesUl.append(
      "<li class='message'>" +
      "<span class='timestamp'>[" + Util.formatDate(time) + "] </span>" +
      "<span class='username'>" + username + ": </span>" +
      "<span class='message'>" + message + "</span>" +
      "</li>");

    Util.scrollDown(this.messageEntry);
  };

  CommandCenter.prototype.addNotification = function(time, message) {
    this.messagesUl.append(
      "<li class='notification'>" +
      "<span class='timestamp'>[" + Util.formatDate(time) + "] </span>" +
      "<span class='notification'>" + message + "</span>" +
      "</li>");

    Util.scrollDown(this.messageEntry);
  };


  CommandCenter.prototype.handleMessageInput = function() {
    var message = this.messageEntry.val(),
      command = null,
      args = [];

    this.messageEntry.val('');

    if (message.charAt(0) === '/') {
      // Looks like a command. What is the first word?
      command = message.substr(1).split(/\s+/)[0];
      if (this.commands[command] !== undefined && typeof(this.commands[command]) === 'function') {
        // Split arguments into an array.
        args = message.substr(command.length + 1).split(/\s+/);
        args = _.without(args, '');

        // Call the bound function with any additional arguments.
        this.commands[command].apply(undefined, args);
      } else {
        this.addNotification(Date.now(), 'Not a valid command.');
        this.addNotification(Date.now(), 'Valid commands are: ' + _.keys(this.commands).join(', '));
      }
    } else {
      this.sendMessage(message);
    }
  };

  CommandCenter.prototype.refreshRoomUserList = function() {
    this.emit('userList');
  };

  CommandCenter.prototype.destroy = function() {
    this.userListDiv.html('');
  };

  CommandCenter.prototype.logout = function() {
    this.disconnect();
  };

  CommandCenter.prototype.emit = function(event, data) {
    data = data || {};
    data = _.extend(data, {roomName: this.roomName});

    this.socket.emit(event, data);
  };


  CommandCenter.prototype.listCommands = function() {
    var message = 'Available commands: ' + _.keys(this.commands).join(', ');
    this.addNotification(Date.now(), message);
  };

  CommandCenter.prototype.addCommand = function(command, fn) {
    if (typeof(fn) !== 'function') {
      throw new Error('Must add a function.');
    }

    // Could possibly add "replaceCommand" function if this is required.
    if (this.commands[command] !== undefined) {
      throw new Error ('Error! Command already exists.');
    }

    this.commands[command] = fn;
  };

  // Allow the client code to add additional socket events.
  CommandCenter.prototype.addListener = function (event, fn) {
    this.socketEvents[event] = fn;
  };

  return CommandCenter;
});
