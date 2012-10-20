
var util  = require('util'),
    debug = false;

var Memcache = function () {
    if (debug) util.log('Memcache|CTOR');
    this.cache = {};
};

Memcache.prototype = {
    set : function (key, value, next) {
        if (debug) util.log('Memcache|set|key='+key + '|value='+value);
        this.cache[key] = value;
        if (next) next(null, value);
    },
    get : function (key, next) {
        if (debug) util.log('Memcache|get|key='+key + '|value='+this.cache[key]);
        if (next) next(null, this.cache[key]);
    }
};

module.exports = function() {
    if (debug) util.log('Memcache|export');
    var Client = {
        create : function() {
            if (debug) util.log('Memcache|create');
            return new Memcache();
        }
    };
    
    return {
        Client : Client
    };
}();
