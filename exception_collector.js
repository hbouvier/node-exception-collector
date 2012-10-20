/////////////////////////////////////////////////////////////////////////////////////////
//
"use strict";

/////////////////////////////////////////////////////////////////////////////////////////
//
//  Module dependencies.
//
var express     = require('express'),
    http        = require('http'),
    https       = require('https'),
    dgram       = require('dgram'),
    io          = require('socket.io'),
    ioclient    = require('socket.io-client'),
    udpServer   = dgram.createSocket('udp4'),
    path        = require('path'),
    util        = require('util'),
    step        = require('step'),
    fs          = require('fs'),
    SimpleMongo = require('./modules/SimpleMongo.js'),
    bodyParser  = require('./modules/bodyParser');
    
var mongo = new SimpleMongo();

/////////////////////////////////////////////////////////////////////////////////////////
//
//  OVERConfiguration
//
var regex_ = /^(\s*[^=\s]+)\s*=(.*)$/;
process.argv.forEach(function (val, index, array) {
    var capture = val.match(regex_);
    if (capture !== null && capture[0] !== undefined && capture.length === 3) {
        process.env[capture[1]] = capture[2];
    }
});

/////////////////////////////////////////////////////////////////////////////////////////
//
//  Configuration
//
var config              = JSON.parse(fs.readFileSync(path.join(__dirname, '/config/exception_collector.json')));
    config.version      = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'))).version;
    config.http.port    = process.env.PORT         || config.http.port,
    config.https.port   = process.env.SPORT        || config.https.port,
    config.mongo.url    = process.env.MONGOLAB_URI || config.mongo.url;


/////////////////////////////////////////////////////////////////////////////////////////
//
//  Global variable initialization
//
var app           = express();

/////////////////////////////////////////////////////////////////////////////////////////
//
// Express configuration for ALL environment
//
app.configure(function () {
    app.use(express.logger('default')); /* 'default', 'short', 'tiny', 'dev' */
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(bodyParser.xml);
    app.use(app.router);
    
    app.use(function logErrors(err, req, res, next) {
        util.log(err.stack);
        next(err);
    });
    
    app.use(function clientErrorHandler(err, req, res, next) {
        if (req.xhr) {
            res.send(500, { error: 'Something blew up!' });
        } else {
            next(err);
        }
    });
    
    app.use(function errorHandler(err, req, res, next) {
        res.status(500);
        //res.render('error', { error: err });
    });
    
    app.use(express.favicon());
    app.use(express.static(path.join(__dirname, 'public')));
    app.param(function paramRegexExtractor(name, fn) {
        if (fn instanceof RegExp) {
            return function(req, res, next, val) {
                res=res;
                var captures;
                if ((captures = fn.exec(String(val))) !== null) {
                    req.params[name] = captures;
                    next();
                } else {
                    next('route');
                }
            };
        }
    });
});

/////////////////////////////////////////////////////////////////////////////////////////
//
// Express configuration for development on your local machine
//
app.configure('development', function () {
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

/////////////////////////////////////////////////////////////////////////////////////////
//
// Express configuration for production in HEROKU
//
app.configure('production', function () {
    //  var oneYear = 31557600000;
    //  app.use(express.static(__dirname, { maxAge: oneYear }));
    app.use(express.errorHandler());
});


var httpserver,
    httpsserver,
    socketIoServer,
    socketIoClient,
    udpRouter;

step(
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //  Connect to the database
    //
    function connectToDatabase() {
        if (config.mongo.active) {
            mongo.init(config.mongo);
            mongo.connect(this);
        } else return 'skip';
    },

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //  Update/Create the database Scheama
    //
    function updateSchema(err, result) {
        if (err) throw err;
        if (!result || result !== 'skip') util.log('server|database|connected');
        if (config.mongo.active) {
            mongo.schema(config.mongo.schema, this);
        } else return 'skip';
    },

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //  Start HTTPS Server
    //
    function startHTTPSServer(err, result) {
        if (err) throw err;
        if (!result || result !== "skip") util.log('server|database|schema|updated');
        if (config.https.active) {
            httpsserver = https.createServer(config.https.options, app).listen(config.https.port, this);
        } else {
            return "skip";
        }
    },

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //  Start HTTP Server
    //
    function startHTTPServer(err, result) {
        if (err) throw err;
        if (!result || result !== "skip") util.log('server|https|express|stared|port=' + config.https.port);
        if (config.http.active) {
            httpserver = http.createServer(app).listen(config.http.port, this);
        } else {
            return "OK";
        }
    },
    
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //  listen for websockets events
    //
    function startSocketIOServer(err, result){
        if (err) throw err;
        if (!result || result !== "skip") util.log('server|http|express|starting|port=' + config.http.port);
        if (config.socketioserver.active) {
            socketIoServer = io.listen(httpserver);
            socketIoServer.set('log level', 1);
        }
        return socketIoServer ? 'OK' : 'skip';
    },

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //  listen for websockets events
    //
    function startSocketIOClient(err, result){
        if (err) throw err;
        if (!result || result !== "skip") util.log('server|http|socket.io|server|started');
        if (config.socketioclient.active) {
            socketIoClient =  ioclient.connect(config.socketioclient.protocol + '://' + config.socketioclient.host + ':' + config.socketioclient.port);
            socketIoClient.set('log level', 1);
        }
        return socketIoClient ? 'OK' : 'skip';
    },
    
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //  UPD Router
    //
    function startUDP(err, result) {
        if (err) throw err;
        if (!result || result !== "skip") util.log('server|http|socket.io|client|started|url='+config.socketioclient.protocol + '://' + config.socketioclient.host + ':' + config.socketioclient.port);
        if (config.udp.active) {
            udpRouter   = require('./modules/udpRouter')(config, udpServer);
            udpServer.on('listening', this);
            udpServer.bind(config.udp.port);
        } else {
            return 'skip';
        }
    },    
    
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //  Include router
    //
    function startRouter(err, result) {
        if (err) throw err;
        if (!result || result !== "skip") util.log('server|http|udp|started|port='+config.udp.port);
        require('./routes')(config, app, {socketIoServer:socketIoServer, socketIoClient:socketIoClient, mongo:mongo});
        return 'OK';
    },
    function done(err, result) {
        if (err) throw err;
        util.log("server|startup|completed");
    }
);
