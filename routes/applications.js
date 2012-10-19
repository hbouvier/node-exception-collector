var moduleName    = 'applications',
    util          = require('util'),
    fs            = require('fs');

module.exports = function (serverConfig, app, options) {
    var config_        = serverConfig.routes[moduleName],
        debug_         = config_.debug        || false,
        context_       = config_.context      || '',
        mongo_         = options.mongo,
        collectionName = 'applications';

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // REST - POST
    //
    function post(req, res) {
        var obj = typeof(req.body) === 'object' ? req.body : JSON.parse(req.body);
        
        // -- Does the application alreay exists
        //
        mongo_.findOne(collectionName, {name:req.body.name}, function (err, item) {
            if (err || item === null) {
                // -- NO, create it
                //
                mongo_.insert(collectionName, obj, function (err, result) {
                    if (err) {
                        res.writeHead(409, {'Content-Type': 'application/json'});
                        res.end('{"err":'+ util.inspect(err) + ',"id"="'+obj.name+'"}');
                        return;
                    }
                    if (debug_) util.log('insert result=' + util.inspect(result));
                    
                    // -- Create the application exception collection
                    //
                    var template = serverConfig.mongo.template;
                    template.collections[0].name = 'app_' + result[0]._id;
                    if (debug_) util.log('template=' + util.inspect(template));
                    mongo_.schema(template, function (err, ignoreme) {
                        if (err) {
                            res.writeHead(409, {'Content-Type': 'application/json'});
                            res.end('{"err":'+ util.inspect(err) + ',"id"="'+obj.name+'"}');
                            return;
                        } else {
                            res.writeHead(201, {'Content-Type': 'application/json'});
                            res.end('{"application":"'+obj.name+'","apikey":"'+result[0]._id+'","status":"' + 'OK' + '"}');
                        }
                    });

                });        
            } else {
                res.writeHead(409, {'Content-Type': 'application/json'});
                res.end('{"err":'+ util.inspect(err) + ',"name"="'+obj.name+'"}');
            }
        });
    }
    
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // public HTTP(s)  routes
    //
    app.post(context_, post);
};
