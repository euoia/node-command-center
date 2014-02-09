//  Created:            Wed 30 Oct 2013 11:19:04 AM GMT
//  Last Modified:      Sun 09 Feb 2014 05:25:47 PM EST
//  Author:             James Pickard <james.pickard@gmail.com>
// --------------------------------------------------
// Summary
// ----
// The purpose of this object is to provide socket.io room helper functions and
// to centralize socket.io event handler management inside your application.
//
// Right now the support for chat rooms is built in, but this could be factored
// out into a separate module.
//
// Features:
//    * Handles joining and leaving rooms (subscribe and unsubscribe events).
//    * Handles client disconnections (disconnect event).
//    * Manages room user lists, associates session and socket.
//    * Provides helper functions to send a message to a user or to a room.
//
// Socket.io events responded to:
//    Event name:  subscribe
//    Description: The socket/session subscribes to a room. Users in the room are notified.
//    eventData:   Requires roomName => (string).
//
//    Event name:  unsubscribe
//    Description: The socket/session unsubscribes from a room. Users in the room are notified.
//    eventData:   Requires roomName => (string).
//
//    Event name:  message
//    Description: The socket/session sends a message to a room. Users in the room are notified.
//    eventData:   Requires roomName => (string), message => (string).
//
//    Event name:  userList
//    Description: The socket/session requests the user list of a room.
//    eventData:   Requires roomName => (string).
//
// --------------------------------------------------
// Module dependencies
// ----
// socket.io         - Only used for the following line (TODO: Can we remove this?):
//    this.sessionSocketIO.io = sio.listen(server);
// session.socket.io - https://github.com/wcamarao/session.socket.io
//                     This helpful module passes the Connect session object to
//                     socket.io event handler functions. This way, socket handler
//                     functions can check the user's session details.
// underscore        - Used for various helper functions.
// util              - (node built-in) used for various helper functions.
// sanitize          - Used for HTML sanitizing messages before sending them.
//
// Implied dependencies
// ----
// Node web server object (returned by http.createServer) -
//    Passed to constructor as server. Only used for the following line (TODO:
//    Can we remove this?):
//      this.sessionSocketIO.io = sio.listen(server);
//
// Express (actually Connect middleware) session store -
//    Passed to constructor as sessionStore. Only used for the following line
//    (TODO: Can we remove this?):
//      this.sessionSocketIO = new
//
//
// Express (actually Connect middleware) cookie parser -
//    Passed to constructor as cookieParser. Only used for the following line
//    (TODO: Can we remove this?):
//      SessionSockets(this.sessionSocketIO.io, sessionStore, cookieParser);
//
// Express (actually Connect middleware) session object -
//    Passed to initSession function, passed to socket.io events.
//    Extended with rooms key, which is an array of room names that the session
//    has subscribed to.
//    TODO: Don't extend the session object if possible.
// --------------------------------------------------
// TODOs
// ----
// TODO: Build an eventData validator, since validation of this gets repeated often.
// TODO: Re-add an example of how to use this.
// TODO: It would be ideal if this module did not have a dependency on
//       session.socket.io - I would prefer that dependency to be present in the
//       parent module (node-games-lobby). Whether that's easy or not, I don't know.
// --------------------------------------------------

var _ = require('underscore'),
  util = require('util'),
  sanitize = require('validator').sanitize;

// Adds the following keys to the session:
// rooms - An array of room names that the session is currently present in.
//         This is used for rejoining when the client sends a checkSession request.
//
// TODO: Perhaps introduce a CommandCenterSession object so that we don't have
// to pass the session and socket objects around to the sendNotification
// messages.
//

// eventListener allows consuming code to listen to events occurring in the
// Command Center. The following events are emitted:
// 'subscribe': A socket has subscribed to a room.
function CommandCenter(sessionSocketIO, eventEmitter) {
  var $this = this;

  this.sessionSocketIO = sessionSocketIO;

  var emit = function (eventName, eventData) {
    if (eventEmitter) {
      eventEmitter.emit(eventName, eventData);
    }
  };

  // Array of socket events that can be handled.
  this.socketEvents  = {
    'subscribe': function(socket, session, eventData) {
      if (eventData.roomName === undefined) {
        console.log('CommandCenter: subscribe event, warning: %s did not specify a roomName.', session.username);
        return;
      }

      var usernamesInRoomBeforeJoining = _.pluck($this.sessionSocketIO.io.sockets.clients(eventData.roomName), 'username');

      // Add the socket to the room.
      socket.join(eventData.roomName);

      // Add the room name to the session.
      if (_.contains(session.rooms, eventData.roomName) === false) {
        session.rooms.push(eventData.roomName);
        session.save();
      }

      var usernamesInRoomAfterJoining = _.pluck($this.sessionSocketIO.io.sockets.clients(eventData.roomName), 'username');

      // Send the user list to the socket.
      // A user may have multiple socket connections so we need the unique list of usernames.
      $this.sendRoomUserList(socket, eventData.roomName);

      // If already present, the socket needs to join, but do not notify the room.
      if (_.contains(usernamesInRoomBeforeJoining, socket.username)) {
        $this.sendNotification(socket, util.format('You have rejoined %s.', eventData.roomName), eventData.roomName);
      } else {
        $this.sendNotification(socket, util.format('You have joined %s.', eventData.roomName), eventData.roomName);
        $this.sendRoomNotification(socket, eventData.roomName, util.format('%s has joined %s.', session.username, eventData.roomName));
        $this.broadcastRoomUserList(socket, eventData.roomName, _.uniq(usernamesInRoomAfterJoining));
      }

      emit('subscribe', {roomName: eventData.roomName});

      console.log('CommandCenter: subscribe event, success: %s subscribed to %s.', session.usernane, eventData.roomName);
    },
    'unsubscribe': function(socket, session, eventData) {

      if (eventData.roomName === undefined) {
        console.log(util.format('CommandCenter: unsubscribe event, warning: %s did not specify a roomName.', session.username));
        return;
      }

      socket.leave(eventData.roomName);
      $this.sendRoomNotification(
        socket,
        eventData.roomName,
        util.format('%s has left %s.', session.username, eventData.roomName));

      console.log(util.format(
        'CommandCenter: unsubscribe event, success: %s unsubscribed from %s.',
        session.username,
        eventData.roomName));
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
        usernamesInRoom                = _.pluck($this.sessionSocketIO.io.sockets.clients(room), 'username');
        usernamesInRoomAfterLeaving    = _.without(usernamesInRoom, socket.username);
        timesInRoom                    = usernamesInRoom.length - usernamesInRoomAfterLeaving.length;

        // Only display the disconnect message if this is the last socket the user has open to the room.
        if (timesInRoom === 1) {
          $this.sendRoomNotification(socket, room, util.format('%s has disconnected from %s.', session.username, room));
          $this.broadcastRoomUserList(socket, room, _.uniq(usernamesInRoomAfterLeaving));
        }
      }

      console.log('CommandCenter: disconnect event, success: %s disconnected.', session.username);
    },
    'message': function(socket, session, eventData) {
      // TODO: This kind of checking and logging is probably OTT. We could have some kind of separate validation module.
      if (eventData.roomName === undefined) {
        console.log('CommandCenter: message event, warning: %s sent a message but did not specify roomName.', session.username);
        return;
      }

      if (eventData.message === undefined) {
        console.log('CommandCenter: message event, warning: %s sent a message but did not specify message.', session.username);
        return;
      }

      console.log('CommandCenter: message event, success: %s sent the following message to %s: %s', session.username, eventData.roomName, eventData.message);
      $this.sendRoomMessage(socket, eventData.roomName, session.username, eventData.message);
    },
    'userList': function(socket, session, eventData) {
      if (eventData.roomName === undefined) {
        console.log('CommandCenter: userList event, warning: %s requested userList but did not specify roomName.', session.username);
        return;
      }

      console.log('CommandCenter: userList event, success: %s requested userList.', session.username);
      $this.sendRoomUserList(socket, eventData.roomName);
    }
  };

  // Event handlers for the socket are set up on the connection event.
  // So long as the event handlers are added before the socket connects, they
  // will be available to the socket.
  this.sessionSocketIO.on('connection', function(err, socket, session) {
    console.log('CommandCenter: connection event.');
    if (err) {
      console.log("Error from sessionSocket.on('connection'), throwing.");
      throw(err);
    }

    // Bind event handlers to the socket.
    for (var event in $this.socketEvents) {
      console.log('CommandCenter: Bound event to socket for %s: %s.', session.username, event);
      socket.on(event, $this.socketEvents[event].bind(this, socket, session));
    }

    // Store anything extra on the socket object.
    // TODO: Is this really necessary? All the socket handler functions should
    // receive the session anyway.
    socket.username = session.username;

    // Disconnect any other sockets associated with this username.
    // TODO: This ought to be configurable.
    this.disconnectOtherSocketsMatchingUsername(session.username, socket);
  }.bind(this));
}

// Allow the consuming code to add additional socket events.
// All socket events are bound when the client connects.
// TODO: Error if a reserved event name is used.
CommandCenter.prototype.addEventHandler = function (event, fn) {
  console.log ('CommandCenter: Adding event handler for event=%s.', event);
  this.socketEvents[event] = fn;
};

// Allow consuming code to add namespaced socket events.
CommandCenter.prototype.addNamespacedEventHandler = function (ns, event, fn) {
  ns = '/' + ns;
  console.log('CommandCenter: Adding namespaced event handler ns=%s event=%s.', ns, event);
  this.sessionSocketIO.of(ns).on(event, fn);
};

// Force disconnection of any other sockets matching this usename.
// This may be used to enforce a one-username-one-socket policy.
// Leaves the socket provided connected.
CommandCenter.prototype.disconnectOtherSocketsMatchingUsername = function (username, socket) {
  this.getSocketsMatchingUsername(username).forEach(function(s) {
    if (socket === s) {
      return;
    }

    if (s === undefined) {
      return;
    }

    this.sendNotification(s, 'You have connected in another window, disconnecting.');
    s.disconnect();
  }.bind(this));
};


// --------------------------------------------------
// Emitters.
// ----
// These methods emit events (with eventData) to sockets.
// TODO: Merge these methods as much as possible. Use named arguments (pass an
// object in).

// Room emitters.
// ----
// Send the user list of a given room to the socket.
CommandCenter.prototype.sendRoomUserList = function(socket, roomName) {
  var users = _.pluck(this.sessionSocketIO.io.sockets.clients(roomName), 'username');
  users = _.uniq(users);

  socket.emit('userList', {
    roomName: roomName,
    users: users
  });
};

// Send the user list of a given room to the room.
CommandCenter.prototype.broadcastRoomUserList = function(socket, roomName, userList) {
  socket.broadcast.to(roomName).emit('userList', {
    roomName: roomName,
    users: userList
  });
};

// Send a message from a user to a room; exluding a single socket.
CommandCenter.prototype.sendRoomMessage = function(socket, roomName, usernameFrom, message) {
  message = sanitize(message).entityEncode();
    socket.broadcast.to(roomName).emit('message', {
      time: Date.now(),
      username: usernameFrom,
      roomName: roomName,
      message: message
    });
};

// Send a message to all clients in a room.
CommandCenter.prototype.roomEmit = function(roomName, eventName, eventData) {
  this.sessionSocketIO.io.sockets.in(roomName).emit(eventName, eventData);
};

CommandCenter.prototype.getSocketsMatchingUsername = function(username) {
  var sockets = [];

  for (var socketID in this.sessionSocketIO.io.sockets.sockets) {
    if (this.sessionSocketIO.io.sockets.sockets.hasOwnProperty(socketID) === false) {
      continue;
    }

    var socket = this.sessionSocketIO.io.sockets.sockets[socketID];

    if (socket.username === username) {
      sockets.push(socket);
    }
  }

  return sockets;
};

// Send an event to all sockets matching a username.
CommandCenter.prototype.usernameEmit = function(username, eventName, eventData) {
  console.log("usernameEmit", username, eventName, eventData);

  this.getSocketsMatchingUsername(username).forEach(function(socket) {
    socket.emit(eventName, eventData);
  }.bind(this));
};

// Send an event to all sockets matching a username.
CommandCenter.prototype.notifyUsername = function(username, message, roomName) {
  console.log("notifyUsername", username, message);

  this.getSocketsMatchingUsername(username).forEach(function(socket) {
    this.sendNotification(socket, message, roomName);
  }.bind(this));
};


// Socket emitters.
// ----
// Send a direct message from a user to a socket.
//
// roomName is optional - if not specified then the message will appear in all
// room windows.
CommandCenter.prototype.sendMessage = function(socket, usernameFrom, message, roomName) {
  message = sanitize(message).entityEncode();
  socket.emit('message', {
    time: Date.now(),
    username: usernameFrom,
    message: message,
    roomName: roomName
  });
};

// Send a notification to a room; exluding a single socket.
CommandCenter.prototype.sendRoomNotification = function(socket, roomName, message) {
  message = sanitize(message).entityEncode();
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
// TODO: Rename to notifyRoom, etc.
CommandCenter.prototype.sendNotification = function(socket, message, roomName) {
  message = sanitize(message).entityEncode();
  socket.emit('notification', {
    time: Date.now(),
    message: message,
    roomName: roomName
  });
};

// ----------------------
// Static methods.
// ----------------------

// CommandCenter.initSession.
// Initialize the express session object.
// TODO: Do not extend the session object.
CommandCenter.initSession = function(session) {
  console.log('CommandCenter: initSession', session);
  session.rooms = [];
};

module.exports = CommandCenter;
