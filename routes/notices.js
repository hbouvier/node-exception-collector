var moduleName    = 'notices',
    util          = require('util'),
    fs            = require('fs'),
    ExceptionAPI  = require('../modules/ExceptionAPI'),
    api           = new ExceptionAPI(),
    xml2js        = require('xml2js');

module.exports = function (serverConfig, app, options) {
    var config_          = serverConfig.routes[moduleName],
        debug_           = config_.debug === undefined ? serverConfig.debug : config_.debug,
        context_         = config_.context      || '',
        mongo_           = options.mongo,
        appCollection    = 'applications',
        exceptCollection = 'exceptions';
        
        
    api.init({debug: debug_, mongo:mongo_});

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // REST - GET
    //
    function get(req, res) {
        res.end('<html><body><pre>OK</pre></body></html>\n');
    }

    //
    // REST - POST
    //
    function post(req, res) {
        req.setEncoding('utf8');
        if (debug_) util.log('POST|BODY='+util.inspect(req.body));
        
        var parser = new xml2js.Parser();
        parser.parseString(req.body, function (err, xml) {
            if (err) {
                if (debug_) util.log('PARSE ERROR:' + util.inspect(err));
                res.writeHead(501, {'Content-Type': 'application/xml; charset=utf-8'});
                res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
                res.write('<error>\n');
                res.write(' INVALID REQUEST\n');
                res.end('</error>\n');
            } else {
                if (debug_) util.log('PARSE OK');
                var client = {
                    version     : xml.notice.$.version,
                    apikey      : xml.notice['api-key'],
                    drivername  : xml.notice.notifier[0].name,
                    driverver   : xml.notice.notifier[0].version,
                    driverurl   : xml.notice.notifier[0].url
                };
                if (debug_) util.log('PARSE|client=' + util.inspect(client));
                
                api.clientAllowed(client.apikey, function (err, app) {
                    if (err || app === null) {
                        if (debug_) util.log('api not allowed|err=' + util.inspect(err));
                        res.writeHead(501, {'Content-Type': 'application/xml; charset=utf-8'});
                        res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
                        res.write('<error>\n');
                        res.write(' NOT ALLOWED\n');
                        res.end('</error>\n');
                    } else {
                        if (debug_) util.log('api|OK');
                        var exception = {
                            exceptionClass : xml.notice.error[0]['class'],  // java.lang.Exception
                            message        : xml.notice.error[0].message,   // El Kaput!
                            backtrace      : [],
                            environment    : {
                                root : xml.notice['server-environment'][0]['project-root'],  // git@github.com/project.git
                                name : xml.notice['server-environment'][0]['environment-name']      // production-v130
                            }
                        };
                        for (var backtraceIndex = 0 ; backtraceIndex < xml.notice.error[0].backtrace[0].line.length ; ++backtraceIndex ) {
                            var backtrace = {
                                method : xml.notice.error[0].backtrace[0].line[backtraceIndex].$.method,
                                file   : xml.notice.error[0].backtrace[0].line[backtraceIndex].$.file,
                                number : xml.notice.error[0].backtrace[0].line[backtraceIndex].$.number
                            };
                            exception.backtrace.push(backtrace);
                        }
                        if (debug_) util.log('PARSE|exception=' + util.inspect(exception));
                        api.publish(client, exception, function (err, result) {
                            if (err) {
                                if (debug_) util.log('PUBLISH|err=' + util.inspect(err));
                                res.writeHead(501, {'Content-Type': 'application/xml; charset=utf-8'});
                                res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
                                res.write('<error>\n');
                                res.write(' ERROR\n');
                                res.end('</error>\n');
                            } else {
                                if (debug_) util.log('PUBLISH|OK');
                                res.writeHead(201, {'Content-Type': 'application/xml; charset=utf-8'});
                                res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
                                res.write('<notice>\n');
                                res.write(' <id>5080535a3a2714000b000001</id>\n');
                                res.write(' <url>http://mmferrbit.herokuapp.com/locate/123</url>\n');
                                res.end('</notice>\n');
                            }
                        });
                    }
                });
                
                
                    

            }
        });
    }
    
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // public HTTP(s)  routes
    //
    app.get(context_, get);
    app.post(context_, post);
};
