node-command-center
----
The purpose of this module is to provide socket.io room helper functions and
to centralize socket.io event handler management inside your express application.

Right now the support for chat rooms is built in, but this may be factored
out into a separate module.

Features
----
* Handles joining and leaving rooms (subscribe and unsubscribe events).
* Handles client disconnections (disconnect event).
* Manages room user lists, associates session and socket.
* Provides helper functions to send a message to a user or to a room.

Socket.io events responded to
----
Roses are red
Violets are blue

Event name:  subscribe
Description: The socket/session subscribes to a room. Users in the room are notified.
eventData:   Requires roomName => (string).

Event name:  unsubscribe
Description: The socket/session unsubscribes from a room. Users in the room are notified.
eventData:   Requires roomName => (string).

Event name:  message
Description: The socket/session sends a message to a room. Users in the room are notified.
eventData:   Requires roomName => (string), message => (string).

Event name:  userList
Description: The socket/session requests the user list of a room.
eventData:   Requires roomName => (string).

Module dependencies
----
*socket.io* -
    Used to bind between socket.io and node web server object.

*session.socket.io* -
    Used for associating the session and socket objects. TODO: More info.

*underscore* -
    Used for various helper functions.

*util* -
    (node built-in) used for various helper functions.

*sanitize* -
    Used for HTML sanitizing messages before sending them.

Implied dependencies
----
*Node web server object (returned by http.createServer)* -
   Passed to constructor as server.

*Express (actually Connect middleware) session store* -
   Passed to constructor as sessionStore.

*Express (actually Connect middleware) cookie parser* -
   Passed to constructor as cookieParser.

*Express (actually Connect middleware) session object* -
   Passed to initSession function, passed to socket.io events.
   Extended with rooms key, which is an array of room names that the session
   has subscribed to.

TODOs
----
* Build an eventData validator, since validation of this gets repeated often.
