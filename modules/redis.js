// REDISTOGO_URL = 'redis://username:password@localhost:6789' 
// export REDISTOGO_URL=redis://localhost:6379;node server.js

var redis    = require('redis-node'),  // https://github.com/bnoguchi/redis-node.git
    url      = require('url'),
    util     = require('util'),
    defaultttl = 1000.0,
    debug    = true;


module.exports = function() {
    if (debug) util.log('Redis|export');
    var Client = {
        create : function() {
            if (debug) util.log('REDIS|LOG|create');
            return new Redis();
        }
    };
    
    return {
        Client : Client
    };
}();

function Redis() {
    if (process.env.REDISTOGO_URL || process.env.REDIS_URL) {
        this.redisURL = url.parse(process.env.REDISTOGO_URL || process.env.REDIS_URL);
        this.log('url=' + util.inspect(this.redisURL, false, null));
        this.client = this.createClient('client', this.redisURL, true);
    }
}
Redis.prototype.log = function(msg) {
    if (debug) util.log('REDIS|LOG|' + msg);
};

Redis.prototype.uuid = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
};


Redis.prototype.createClient = function(prefix, redisURL, authOnReconnect, database) {
    var $this = this;
    var client   = redis.createClient(redisURL.port, redisURL.hostname); //, options = {}
    
    if (database) {
        client.select(database);
    }
    if (redisURL.auth) {
        this.log(prefix+':create - with auth');
        client.auth(redisURL.auth.split(':')[1], function (err, reply) {
            $this.log(prefix+':create: auth err=[' + util.inspect(err, true, null) + '], reply=[' + util.inspect(reply, true, null) + ']');
        });
    } else {
        $this.log(prefix+':create - no auth');
    }

    client.on('connected', function () {
        $this.log(prefix+':connected');
        if (false && authOnReconnect && redisURL.auth) {
            $this.log(prefix+':connected - with auth');
            client.auth(redisURL.auth.split(':')[1], function (err, reply) {
                $this.log(prefix+':connected: auth err=[' + util.inspect(err, true, null) + '], reply=[' + util.inspect(reply, true, null) + ']');
            });
        } else {
            $this.log(prefix+':connected - no auth');
        }
    });
    client.on('disconnected', function () {
        $this.log(prefix+':disconnected');
    });
    client.on('reconnecting', function () {
        $this.log(prefix+':reconnecting');
    });
    client.on('reconnected', function () {
        $this.log(prefix+':reconnected');
        if (authOnReconnect && redisURL.auth) {
            $this.log(prefix+':reconnected - with auth');
            client.auth(redisURL.auth.split(':')[1], function (err, reply) {
                $this.log(prefix+':reconnected: auth err=[' + util.inspect(err, true, null) + '], reply=[' + util.inspect(reply, true, null) + ']');
            });
        } else {
            $this.log(prefix+':reconnected - no auth');
        }
    });
    client.on('noconnection', function () {
        $this.log(prefix+':noconnection');
    });
    client.on('connection error', function (err) {
        $this.log(prefix+':connection error [' + util.inspect(err, true, null) + ']');
    });
    return client;
};


Redis.prototype.subscribe = function(stream, callback) {
    var $this = this;
    this.log('subscribeTo|stream='+stream);
    if (!this.subscribeClient) {
        this.subscribeClient = this.createClient('subscribeClient', this.redisURL, false);
    }
    
    // TODO: Would be nice if we could subscribe to multiple stream
    //unsubscribeFrom(key/pattern)
    this.subscribeClient.subscribeTo(stream, function(channel, message, pattern) {
        $this.log('subscription|stream='+stream+'|channel=' + channel + '|message=' + message + '|pattern=' + pattern); 
        if (callback) {
            process.nextTick(function() {
                callback(null, message);
            });
        }
    });
    
};

Redis.prototype.unsubscribe = function(stream, callback) {
    if (this.vector) {
        if (callback) {
            process.nextTick(function() {
                callback(null, null);
            });
        }
        return;  // Not using redis
    }
    
    if (!this.subscribeClient) {
        if (callback)
            process.nextTick(function() {
                callback('REDIS::unsubscribe|not subscribed to ' + stream + ' (not connected)', null);
            });
        return;
    }
    
    // TODO: Would be nice if we could subscribe to multiple stream
    //unsubscribeFrom(key/pattern)
    this.subscribeClient.unsubscribeFrom(stream);
    if (callback) {
        process.nextTick(function() {
            callback(null, null);
        });
    }
};

Redis.prototype.publish = function(stream, json) {
    this.log('publish|stream=' + stream + '|json=' + json);
    this.client.publish(stream, json);
};


Redis.prototype.set = function(key, json, ttl, callback) {
    var $this = this;
    var ttlInSec = -1;
    
    if (typeof(ttl) === 'function') {
        callback = ttl;
        ttl = undefined;
    } else {
        ttlInSec = parseFloat(ttl) / 1000.0;
        if (ttlInSec < 1.0) {
            ttlInSec = 1;
        } else {
            ttlInSec = parseInt(ttlInSec, 10);
        }
    }
    
    this.log('set|key=' + key + '|json=' + json + '|ttl=' + ttlInSec + ' seconds');
    this.client.set(key, json, function(err, result) {
        if (err) {
            $this.log('set|ERROR=' + util.inspect(err, true, null) +'|');
            if (callback)
                process.nextTick(function() {
                    callback(err, json);
                });
            return;
        }
        $this.log('set|result=' + result);
        if (ttlInSec !== -1) {
            $this.client.expire(key, ttlInSec, function(err, result) {
                if (err) {
                    $this.log('expire|ERROR=' + util.inspect(err, true, null) +'|');
                    if (callback)
                        process.nextTick(function() {
                            callback(err, json);
                        });
                    return;
                }
                $this.log('expire|result=' + result);
                if (callback)
                    process.nextTick(function() {
                        callback(null, json);
                    });
            });
        } else if (callback) {
            process.nextTick(function() {
                callback(null, json);
            });
        }
    });
};

Redis.prototype.get = function(key, callback) {
    var $this = this;
    this.log('get|key=' + key);
    this.client.get(key, function(err, result) {
        if (err) {
            $this.log('get|ERROR=' + util.inspect(err, true, null) +'|');
            if (callback)
                process.nextTick(function() {
                    callback(err, result);
                });
            return;
        }
        $this.log('get|result=' + util.inspect(result));
        if (callback) {
            process.nextTick(function() {
                callback(err, result);
            });
        }
    });
};

