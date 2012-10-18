module.exports = (function() {
    function xml(req, res, next) {
        // ignore if body is already parsed or GET/HEAD request
        //
        if (req._body            || // body already parsed
            'GET' == req.method  || // no body for GET
            'HEAD' == req.method || // no body for HEAD
            'application/xml' !== req.headers['content-type'] // check Content-Type
        ) {
            return next();
        }
        
        // Initialize the body
        //
        req.body  = req.body || {};
        req._body = true; // flag as parsed
        req.setEncoding('utf8');
    
        var body = '';
        req.on('data', function (chunk) {
            body =  body + chunk;
        });
        
        req.on('end', function () {
            req.body = body;
            next();
        });
    }
    
    function base64(req, res, next) {
        // ignore if body is already parsed or GET/HEAD request
        //
        if (req._body            || // body already parsed
            'GET' == req.method  || // no body for GET
            'HEAD' == req.method || // no body for HEAD
            'application/x-www-form-urlencoded' !== req.headers['content-type'] // check Content-Type
        ) {
            return next();
        }
        
        // Initialize the body
        //
        req.body  = req.body || {};
        req._body = true; // flag as parsed
        req.setEncoding('utf8');
    
        var body = '';
        req.on('data', function (chunk) {
            body =  body + chunk;
        });
        
        req.on('end', function () {
            var bodyParts = body.split(/&/);
            for (var index in bodyParts) {
                var pos   = bodyParts[index].indexOf('=');
                var key   = bodyParts[index].substr(0, pos);
                var value = bodyParts[index].substr(pos +1);
                req.body[key] = value;
            }
            next();
        });
    }
    
    return {
        xml    : xml,
        base64 : base64
    };
})();