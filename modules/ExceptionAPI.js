var util       = require('util'),
    step       = require('step'),
    crypto     = require('crypto'),
    airbrake   = require('airbrake'),
    moduleName = 'ExceptionAPI';

var ExceptionAPI = function () {
};

ExceptionAPI.prototype = {
    log: function (msg) {
        util.log('LOG  |' + moduleName +'|' + msg);
    },
    exception: function(exception, msg) {
        this.error(exception, msg);
    },
    error: function(err, msg) {
        if (this.airbrake) {
            if (err.component === undefined) err.component = moduleName;
            this.airbrake.notify(err, function(airbrakeErr, url) {
                if (airbrakeErr) {
                    util.log('ERROR|' + moduleName +'|UNDELIVERABLE:' + airbrakeErr +'|' + msg + util.inspect(err));
                } else {
                    util.log('ERROR|' + moduleName +'|delivered|' + msg + util.inspect(err) + '|airbrake:' + url);
                }
            });
        } else {
            util.log('ERROR|' + moduleName + '|' + msg + util.inspect(err));
        }
    },
    info: function (msg) {
        util.log('INFO |' + moduleName +'|'+msg);
    },
    debug: function (msg) {
        if (this.config.debug) util.log('DEBUG|' + moduleName +'|' + msg);
    },

    init: function(config) {
        this.config = {
                         debug: config.debug || true
                      };
        this.mongo = config.mongo;
        this.appCollectionName = 'applications';
        this.exceptCollectionName = 'exceptions';
        this.applications_cache = {};
        this.exceptions_cache = {};
        this.debug('config=' + util.inspect(this.config));
        if (config && config.airbrake && config.airbrake.apikey) {
            this.airbrake = airbrake.createClient(config.airbrake.apikey);
        }
    },

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // Connection wrapper
    //
    clientAllowed: function (apikey, next) {
        var $this = this;
        if (this.applications_cache[apikey]) {
            $this.debug('clientAllowed|apikey='+apikey+'|OK|cache=hit');
            return next(null);
        }
            
        this.mongo.findOne(this.appCollectionName, apikey, function (err, item) {
            if (err) {
                $this.error(err, 'clientAllowed|apikey='+apikey+'|FAILED|err=');
            } else if (item && item._id) {
                $this.debug('clientAllowed|apikey='+apikey+'|OK|cache=miss|fetched|item='+item);
                $this.applications_cache[apikey] = item;
            } else
                $this.debug('clientAllowed|apikey='+apikey+'|DENIED|cache=miss|NOT-FOUND|item='+item);
            next(err, item);
        });
    },
    
    _prettyDate: function(now) {
        now = now ? now : new Date();
        var yyyy = now.getFullYear().toString();
        var mm   = (now.getMonth()+1).toString(); // getMonth() is zero-based
        var dd   = now.getDate().toString();
        var hh   = now.getHours().toString();
        var min  = now.getMinutes().toString();
        var sec  = now.getSeconds().toString();
        var pretty = yyyy + (mm[1]?mm:"0"+mm[0]) + (dd[1]?dd:"0"+dd[0]) +
                     (hh[1]?hh:"0"+hh[0]) + (min[1]?min:"0"+min[0]) + (sec[1]?sec:"0"+sec[0]);
        return pretty;
    },
    
    _updateCount: function(client, exception, next) {
        var $this = this;
        var now = new Date();
        var pretty = $this._prettyDate(now);
        step(
            function yearly() {
                $this.mongo.upserts('app_' + client.apikey,
                                    {
                                        exception_id : exception._id,
                                        category     : 'yearly',
                                        stamp        : now.getFullYear()
                                    },
                                    {
                                        $set : { updated : pretty }, 
                                        $inc : { count   : 1   }
                                    }, 
                                    { upsert: true, safe:false }, 
                                    this.parallel()
                );
            },
            function monthly(err, result) {
                $this.mongo.upserts('app_' + client.apikey, 
                                    {
                                        exception_id : exception._id,
                                        category     : 'monthly',
                                        stamp        : now.getFullYear() +'-' + (now.getMonth() +1)
                                    },
                                    {
                                        $set : { updated : pretty }, 
                                        $inc : { count   : 1   }
                                    }, 
                                    { upsert: true, safe:false }, 
                                    this.parallel()
                );
            },
            function dayly(err, result) {
                $this.mongo.upserts('app_' + client.apikey, 
                                    {
                                        exception_id : exception._id,
                                        category     : 'daily',
                                        stamp        : now.getFullYear() +'-' + (now.getMonth() +1) + '-' + now.getDate()
                                    },
                                    {
                                        $set : { updated : pretty }, 
                                        $inc : { count   :  1  }
                                    }, 
                                    { upsert: true, safe:false }, 
                                    this.parallel()
                );
            },
            function done(err, result) {
                $this.debug('_updateCount|err=' + util.inspect(err) + '|result=' + util.inspect(result));
                next(err, result);
            }
        );
    },
    
    publish: function (client, exception, next) {
        var $this = this;
        var sha1 = this.sha1(JSON.stringify(exception));
        exception.sha1 = sha1;
        if (this.exceptions_cache[sha1] === undefined) {
            this.mongo.findOne(this.exceptCollectionName, {sha1 : sha1}, function (err, item) {
                if (err || item === null) {
                    // -- NO, create it
                    //
                    exception.sha1 = sha1;
                    $this.mongo.insert($this.exceptCollectionName, exception, function (err, result) {
                        if (err) {
                            $this.error(err, 'publish|exception=insert-FAILED|sha=' + sha1 + '|err=');
                            return next(err, null);
                        }
                        $this.debug('publish|exception=' + result[0]._id + '|sha=' + sha1 + '|cache=miss|inserted');
                        exception._id = result[0]._id;
                        $this.exceptions_cache[sha1] = result[0]._id;
                        $this._updateCount(client, exception, next);
                    });
                } else {
                    $this.debug('publish|exception=' + item._id + '|sha=' + sha1 + '|cache=miss|fetched');
                    exception._id = item._id;
                    $this._updateCount(client, exception, next);
                }
            });
        } else {
            $this.debug('publish|exception=' + this.exceptions_cache[sha1] + 'sha=' + sha1 + '|cache=hit');
            exception._id = this.exceptions_cache[sha1];
            $this._updateCount(client, exception, next);
        }
    },
    
    sha1 : function (data) {
        var sha1 = crypto.createHash('sha1');
        sha1.update(data);
        var hex = sha1.digest('hex');
        return hex;
    }

};

module.exports = ExceptionAPI;
