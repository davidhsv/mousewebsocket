var express = require('express')
    , routes = require('./routes')
    , http = require('http')
    , path = require('path')
    , redis = require('redis');

/*
 Setup Express & Socket.io
 */
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server, {
	'flash policy port': -1}
);
var prod = true;
var redisPort, redisUrl;
if (prod) {
	redisPort = 6379;
	redisUrl = "192.168.42.1";
	//redisUrl = "172.31.29.215";
} else {
	var redisPort = 6379;
	var redisUrl = "ec2-54-232-223-183.sa-east-1.compute.amazonaws.com";
}

//Set xhr-polling as WebSocket is not supported by CF
//io.set("transports", ["xhr-polling"]);
io.set("transports", [ "websocket" ]);

//Set Socket.io's log level to 1 (info). Default is 3 (debugging)
io.set('log level', 1);
io.enable('browser client minification');  // send minified client
io.enable('browser client etag');          // apply etag caching logic based on version number
//io.enable('browser client gzip');          // gzip the file



/*
 Also use Redis for Session Store. Redis will keep all Express sessions in it.
 */
var RedisStore = require('connect-redis')(express),
    rClient = redis.createClient(redisPort, redisUrl);

var sessionStore = new RedisStore({client:rClient});
var cookieParser = express.cookieParser('your secret here');

app.configure(function () {
    app.set('port', process.env.PORT || 3000);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());

    /*
     Use cookieParser and session middlewares together.
     By default Express/Connect app creates a cookie by name 'connect.sid'.But to scale Socket.io app,
     make sure to use cookie name 'jsessionid' (instead of connect.sid) use Cloud Foundry's 'Sticky Session' feature.
     W/o this, Socket.io won't work if you have more than 1 instance.
     If you are NOT running on Cloud Foundry, having cookie name 'jsessionid' doesn't hurt - it's just a cookie name.
     */
    app.use(cookieParser);
    app.use(express.session({store:sessionStore, key:'jsessionid', secret:'your secret here'}));

    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function () {
    app.use(express.errorHandler());
});

app.get('/', function(req, res) {
	if (req.session && !req.session.user) {
		req.session.user = Math.floor(Math.random()*10000);
	}
	routes.index(req, res);
});    

app.get('/logout', function(req, res) {
    req.session.destroy();
    res.redirect('/');
});

/*
 When the user logs in (in our case, does http POST w/ user name), store it
 in Express session (which inturn is stored in Redis)
 */
app.post('/user', function (req, res) {
    req.session.user = req.body.user;
    res.json({"error":""});
});

/*
 Use SessionSockets so that we can exchange (set/get) user data b/w sockets and http sessions
 Pass 'jsessionid' (custom) cookie name that we are using to make use of Sticky sessions.
 */
var SessionSockets = require('session.socket.io');
var sessionSockets = new SessionSockets(io, sessionStore, cookieParser, 'jsessionid');


/*
 Create two redis connections. A 'pub' for publishing and a 'sub' for subscribing.
 Subscribe 'sub' connection to 'chat' channel.
 */

var sub = redis.createClient(redisPort, redisUrl);
var pub = redis.createClient(redisPort, redisUrl);
var qtdUsuarios = 0;
sub.subscribe('c');

sessionSockets.on('connection', function (err, socket, session) {
    if(!session.user) {
    	console.log("sem sessao !!!! NADA VER");
	    return;
    }
    

    /*
     When the user sends a chat message, publish it to everyone (including myself) using
     Redis' 'pub' client we created earlier.
     Notice that we are getting user's name from session.
     */
	/*
	 * a = action
	 * p = provendo posicao do mouse
	 * 
	 * u = user
	 * session.usuario = identificador do usuario
	 */
    socket.on('c', function (data) {
        var msg = JSON.parse(data);
        var reply = JSON.stringify([1 , session.user, msg[1], msg[2]]);
        pub.publish('c', reply);
    });

    /*
     When a user joins the channel, publish it to everyone (including myself) using
     Redis' 'pub' client we created earlier.
     Notice that we are getting user's name from session.
     */
	//TODO apertou botao de participar :)
    // Ignorar esse trecho por enquanto
//    socket.on('join', function () {
//        var reply = JSON.stringify({action:'control', user:session.user, msg:' joined the channel' });
//        pub.publish('chat', reply);
//        qtdUsuarios++;
//    });

    /*
     Use Redis' 'sub' (subscriber) client to listen to any message from Redis to server.
     When a message arrives, send it back to browser using socket.io
     */
    sub.on('message', function (channel, message) {
        socket.emit(channel, message);
    });

});

server.listen(app.get('port'), function () {
	var serverName = process.env.VCAP_APP_HOST ? process.env.VCAP_APP_HOST + ":" + process.env.VCAP_APP_PORT : 'localhost:3000';
	console.log("Express server listening on " + serverName);
});
