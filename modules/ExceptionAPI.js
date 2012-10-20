var util       = require('util'),
    step       = require('step'),
    crypto     = require('crypto'),
    airbrake   = require('airbrake'),
    memjs      = require('memjs'),
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
                         debug: config.debug === undefined ? false : config.debug
                      };
        this.mongo = config.mongo;
        this.appCollectionName = 'applications';
        this.exceptCollectionName = 'exceptions';
        this.memcache = memjs.Client.create();
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

        this.memcache.get('apikey:'+apikey, function(err, value) {
            if (err) {
                $this.error(err, 'clientAllowed|apikey='+apikey+'|err=');
            } else if (value) {
                $this.debug('clientAllowed|apikey='+apikey+'|OK|cache=hit');
                return next(null, JSON.parse(value));
            }
            $this.mongo.findOne($this.appCollectionName, apikey.toString(), function (err, item) {
                if (err) {
                    $this.error(err, 'clientAllowed|apikey='+apikey+'|FAILED|err=');
                } else if (item && item._id) {
                    $this.debug('clientAllowed|apikey='+apikey+'|OK|cache=miss|fetched|item='+item);
                    $this.memcache.set('apikey:'+apikey, JSON.stringify(item));
                } else
                    $this.debug('clientAllowed|apikey='+apikey+'|DENIED|cache=miss|NOT-FOUND|item='+item);
                next(err, item);
            });
            
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
        var apikey = client.apikey.toString();

        step(
            function yearly() {
                $this.mongo.upserts('app_' + apikey,
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
                $this.mongo.upserts('app_' + apikey, 
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
                $this.mongo.upserts('app_' + apikey, 
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
        var sha1 = this.sha1(JSON.stringify(exception)).toString();
        exception.sha1 = sha1;
        
        // -- Try to find it in the cache
        $this.memcache.get('exception:'+sha1, function (err, value) {
            if (err) {
                $this.error(err, 'publish|sha1=' +  sha1 + '|cache=FAILED|err=');
            } else if (value) {
                // -- got it, update the counters
                $this.debug('publish|exception=' + value + 'sha=' + sha1 + '|cache=hit');
                exception._id = $this.mongo.id(value.toString());
                return $this._updateCount(client, exception, next);
            }
            
            // -- Not in the cache, lets try to find it in the database
            $this.mongo.findOne($this.exceptCollectionName, {sha1 : sha1}, function (err, item) {
                if (err || item === null) {
                    // -- not there, create it
                    //
                    $this.mongo.insert($this.exceptCollectionName, exception, function (err, result) {
                        // -- GRRR, someone else inserted it at the same time and we lost!
                        if ($this.mongo.isDuplicate(err)) {
                            // -- Let's fetch it, since it is now in the database
                            return $this.mongo.findOne($this.exceptCollectionName, {sha1 : sha1}, function (err, item) {
                                // -- How unlucky are we, its not there... WTF
                                if (err || item === null) {
                                    $this.error(err, 'publish|exception=insert-FAILED|sha=' + sha1 + '|err=');
                                    return next( err, item);
                                }
                                // -- OK, to it, update the counters
                                $this.debug('publish|exception=' + item._id + '|sha=' + sha1 + '|cache=miss|fetched');
                                $this.memcache.set('exception:'+sha1, item._id.toString());
                                exception._id = item._id;
                                return $this._updateCount(client, exception, next);
                            });
                        } else if (err) {
                            // -- Ok, a real error, bail out
                            $this.error(err, 'publish|exception=insert-FAILED|sha=' + sha1 + '|err=');
                            return next(err, null);
                        }
                        // -- OK, we inserted it, now lets update the counters
                        $this.debug('publish|exception=' + result[0]._id + '|sha=' + sha1 + '|cache=miss|inserted');
                        $this.memcache.set('exception:'+sha1, result[0]._id.toString());
                        exception._id = result[0]._id;
                        $this._updateCount(client, exception, next);
                    });
                } else {
                    $this.debug('publish|exception=' + item._id + '|sha=' + sha1 + '|cache=miss|fetched');
                    $this.memcache.set('exception:'+sha1, item._id.toString());
                    exception._id = item._id;
                    $this._updateCount(client, exception, next);
                }
            });
        });
    },
    
    sha1 : function (data) {
        var sha1 = crypto.createHash('sha1');
        sha1.update(data);
        var hex = sha1.digest('hex');
        return hex;
    }

};

module.exports = ExceptionAPI;
