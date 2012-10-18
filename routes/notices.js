var moduleName    = 'notices',
    util          = require('util'),
    fs            = require('fs'),
    xml2js        = require('xml2js');

module.exports = function (serverConfig, app, options) {
    var config_        = serverConfig.routes[moduleName],
        debug_         = config_.debug        || false,
        context_       = config_.context      || '';

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // REST - POST
    //
    function post(req, res) {
        req.setEncoding('utf8');
        if (debug_) util.log('POST|BODY='+util.inspect(req.body));
        
        var parser = new xml2js.Parser();
        parser.parseString(req.body, function (err, xml) {
            if (err) {
                res.writeHead(501, {'Content-Type': 'application/xml; charset=utf-8'});
                res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
                res.write('<error>\n');
                res.write(' INVALID REQUEST\n');
                res.end('</error>\n');
            } else {
                util.log(util.inspect(xml));
                util.log('notice version:' +  xml.notice.$.version); 
                util.log('notice.api-key:' +  xml.notice['api-key']); 
                util.log('notice.notifier.name:' +  xml.notice.notifier[0].name); 
                util.log('notice.notifier.version:' +  xml.notice.notifier[0].version); 
                util.log('notice.notifier.url:' +  xml.notice.notifier[0].url); 
                util.log('notice.error.class:' +  xml.notice.error[0]['class']); 
                util.log('notice.error.message:' +  xml.notice.error[0].message); 
                util.log('notice.error.backtrace.line.method:' +  xml.notice.error[0].backtrace[0].line[0].$.method);
                util.log('notice.error.backtrace.line.file:' +  xml.notice.error[0].backtrace[0].line[0].$.file);
                util.log('notice.error.backtrace.line.number:' +  xml.notice.error[0].backtrace[0].line[0].$.number);
                util.log('notice.server-environment.project-root:' +  xml.notice['server-environment'][0]['project-root']); 
                util.log('notice.server-environment.environment-name:' +  xml.notice['server-environment'][0]['environment-name']); 

                res.writeHead(201, {'Content-Type': 'application/xml; charset=utf-8'});
                res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
                res.write('<notice>\n');
                res.write(' <id>5080535a3a2714000b000001</id>\n');
                res.write(' <url>http://mmferrbit.herokuapp.com/locate/5080535a3a2714000b000001</url>\n');
                res.end('</notice>\n');
            }
        });
    }
    
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // public HTTP(s)  routes
    //
    app.post(context_, post);
};
