var
  http = require('http'),
  Socketio = require('socket.io'),
  SessionSocketIO = require('session.socket.io'),
  CommandCenter = require ('../index.js'),
  EventEmitter = require('events').EventEmitter;

var server = http.createServer();
var socketio = Socketio.listen(server);
var sessionSocketIO = new SessionSocketIO(socketio);
var eventEmitter = new EventEmitter();

var c = new CommandCenter(sessionSocketIO, eventEmitter);

sessionSocketIO.emit('subscribe');
