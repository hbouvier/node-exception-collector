var mongo      = require('mongodb'),
    BSON       = mongo.BSONPure,
    util       = require('util'),
    step       = require('step'),
    airbrake   = require('airbrake'),
    moduleName = 'SimpleMongo';

var SimpleMongo = function () {
};

SimpleMongo.prototype = {
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
        var $this = this;
        this.config = {
                         databasename: config.databasename  || 'test',
                         host:         config.host          || '127.0.0.1',
                         port:         config.port          || 27017,
                         options:      config.options       || {safe:true},
                         debug:        config.debug         || true,
                         url:          config.url
                      };
        this.debug('config=' + util.inspect(this.config));
        if (config && config.airbrake && config.airbrake.apikey) {
            this.airbrake = airbrake.createClient(config.airbrake.apikey);
        }
        if (config !== undefined && config.url !== undefined) {
             var regex_ = /^mongodb:\/\/([^:]*):([^@]*)@([^:]*):([^\/]*)\/(.*)$/;
             var capture = config.url.match(regex_);
             if (capture !== null && capture[0] !== undefined && capture.length === 6) {
                this.debug('url=' + config.url + '|parse=' + util.inspect(capture));
                this.config.user         = capture[1];
                this.config.password     = capture[2];
                this.config.host         = capture[3];
                this.config.port         = parseInt(capture[4]);
                this.config.databasename = capture[5];
             }
        }
        this.db = new mongo.Db(this.config.databasename, 
                               new mongo.Server(this.config.host, 
                                                this.config.port, 
                                                {auto_reconnect: true}),
                               {});
                               
        this.db.addListener('error', function (err) {
            $this.error(err, 'LISTENER:error|err=');
        });
    },

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // Connection wrapper
    //
    connect: function (callback) {
        var $this = this;
        this.debug('connect=' + $this.config.host + ':' + $this.config.port + '|database=' + $this.config.databasename);
        this.db.open(function (err, handle) {
            if (err) {
                $this.error(err, 'connect=' + $this.config.host + ':' + $this.config.port + '|database=' + $this.config.databasename + '|message=perhaps it isn\'t running?|err=');
                return callback(err);
            }
            $this.authenticate(callback);
        });
    },

    authenticate: function (callback) {
        var $this = this;
        if (this.config.user !== undefined && this.config.password !== undefined) {
            this.debug('authenticate=' + $this.config.host + ':' + $this.config.port + '|database=' + $this.config.databasename + 
                       '|user=' + $this.config.user + '|password=' + $this.config.password);
            this.db.authenticate(this.config.user, this.config.password, function (err) {
                if (err) $this.error(err, 'authenticate=' + $this.config.host + ':' + $this.config.port + '|database=' + $this.config.databasename + 
                                     '|user=' + $this.config.user + '|password=' + $this.config.password + '|err=');
                else $this.debug('authenticate=' + $this.config.host + ':' + $this.config.port + '|database=' + $this.config.databasename + 
                                 '|user=' + $this.config.user + '|password=' + $this.config.password + '|message=authenticated and connected');
                callback(err);
            });
        } else {
            $this.debug('authenticate=' + $this.config.host + ':' + $this.config.port + '|database=' + $this.config.databasename + 
                        '|user=' + $this.config.user + '|password=' + $this.config.password + '|message=connected (no authentication required)');
            callback();
        }
    },
    
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // ID
    //
    id: function(id) {
        return new BSON.ObjectID(id);
    },

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // INSERT
    //
    insert: function (collectionName, data, options, next) {
        var $this = this;
        try {
            if (typeof(options) === 'function') {
                next    = options;
                options = $this.config.options;
            }
            this.db.collection(collectionName, function (err, collection) {
                if (err) {
                    $this.error(err, 'insert|collection=' + collectionName + '|data=' + util.inspect(data) + '|err=');
                    return next(err);
                }
                collection.insert(data, options, function (err, objects) {
                    if (err && err.message.indexOf('E11000 ') !== -1) {
                        $this.info('insert|collection=' + collectionName + '|data=' + util.inspect(data) + '|ALREADY-EXISTS');
                    } else if (err) {
                        $this.error(err, 'insert|collection=' + collectionName + '|data=' + util.inspect(data) + '|err=');
                    }
                    next(err, objects);
                });
            });
        } catch (exception) {
            $this.exception(exception, 'insert|collection=' + collectionName + '|data=' + util.inspect(data) + '|exception=');
        }
    },

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //   FINDONE
    //
    findOne: function (collectionName, id, next) {
        var $this = this;
        try {
            this.db.collection(collectionName, function (err, collection) {
                if (err) {
                    $this.error(err, 'findOne|collection=' + collectionName + '|id=' + util.inspect(id) + '|err=');
                    return next(err);
                }
                var key = (typeof(id) === "string") ? {'_id':new BSON.ObjectID(id)}: id;
                collection.findOne(key, function (err, item) {
                    if (err) {
                        $this.error(err, 'findOne|collection=' + collectionName + '|id=' + util.inspect(id) + '|err=');
                    }
                    next(err, item);
                });
            });
        } catch (exception) {
            $this.exception(exception, 'findOne|collection=' + collectionName + '|id=' + util.inspect(id) + '|exception=');
        }
    },
    
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //   FIND 
    //
    find: function (collectionName, order, limit, next) {
        var $this = this;
        try {
            if (typeof(order) === 'function') {
                next = order;
                order = limit = null;
            }
            this.db.collection(collectionName, function (err, collection) {
                if (err) {
                    $this.error(err, 'find|collection=' + collectionName + '|order=' + util.inspect(order) + '|limit=' + util.inspect(limit) + '|err=');
                    return next(err);
                }
                collection.find(function (err, cursor) {
                    if (err) {
                        $this.error(err, 'find|collection=' + collectionName + '|order=' + util.inspect(order) + '|limit=' + util.inspect(limit) + '|err=');
                        next(err, cursor);
                    }
                    if (order === null && limit === null) {
                        next(err, cursor);
                    } else {
                        var dataStore = [];
                        cursor.sort(order).limit(limit).each(function (err, doc) {
                            if (doc) {
                                dataStore.push(doc);
                            } else {
                                next(err, dataStore);
                            }
                        });
                    }
                });
            });
        } catch (exception) {
            $this.exception(exception, 'find|collection=' + collectionName + '|order=' + util.inspect(order) + '|limit=' + util.inspect(limit) + '|exception=');
        }
    },

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //   REMOVE
    //
    remove: function (collectionName, id, options, next) {
        var $this = this;
        try {
            if (typeof(options) === 'function') {
                next    = options;
                options = $this.config.options;
            }
            this.db.collection(collectionName, function (err, collection) {
                if (err) {
                    $this.error(err, 'remove|collection=' + collectionName + '|id=' + util.inspect(id) + '|err=');
                    return next(err);
                }
                collection.remove({'_id':new BSON.ObjectID(id)}, options, function(err, item) {
                    if (err) {
                        $this.error(err, 'remove|collection=' + collectionName + '|id=' + util.inspect(id) + '|err=');
                    }
                    next(err, item);
                });
            });
        } catch (exception) {
            $this.exception(exception, 'remove|collection=' + collectionName + '|id=' + util.inspect(id) + '|exception=');
        }
    },

    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //   UPDATE
    //
    update: function (collectionName, data, options, next) {
        var $this = this;
        try {
            if (typeof(options) === 'function') {
                next    = options;
                options = $this.config.options;
            }
            this.db.collection(collectionName, function (err, collection) {
                if (err) {
                    $this.error(err, 'update|collection=' + collectionName + '|data=' + util.inspect(data) + '|err=');
                    return next(err);
                }
                var id = data._id;
                delete data._id;
                collection.update({'_id':new BSON.ObjectID(id)}, data, options, function(err, item) {
                    if (err) {
                        $this.error(err, 'update|collection=' + collectionName + '|id=' + util.inspect(id) + '|data=' + util.inspect(data) + '|err=');
                    }
                    next(err, item);
                });
            });
        } catch (exception) {
            $this.exception(exception, 'update|collection=' + collectionName + '|data=' + util.inspect(data) + '|exception=');
        }
    },

    
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    //   DATABASE SCHEAM CREATION/UPDATE
    //
    //             "options" : {
    //                "capped" : true,
    //                "size"   : 102400
    //            }
    //
    schema: function (schema, next) {
        var $this = this;
        step(
            function createCollections() {
                $this.debug('scheam|createCollections');
                var group = this.group();
                schema.collections.forEach(function (collectionConfig) {
                    var collectionGroup = group();
                    $this.debug('schema|createCollections|collection=' + collectionConfig.name + '|options=' + util.inspect(collectionConfig.options));
                    $this.db.createCollection(collectionConfig.name, collectionConfig.options, function (err, collection) {
                        if (err) {
                            // We assume that the collection already exists
                            //
                            $this.info('schema|createCollections|collection='+collectionConfig.name+'|err=' + util.inspect(err));
                        }
                        collectionConfig.indexes.forEach(function (index) {
                            var indexGroup = group();
                            $this.debug('schema|createCollections|collection='+collectionConfig.name+'|createIndex|index=' + index.name + '|order=' + util.inspect(index.order) + '|options=' + util.inspect(index.options));
                            collection.ensureIndex(index.order, index.options, function (err, result) {
                                $this.debug('schema|createCollections|collection='+collectionConfig.name+'|createIndex|index=' + index.name + '|order=' + util.inspect(index.order) + '|options=' + util.inspect(index.options)+'|err='+util.inspect(err) + '|result='+util.inspect(result));
                                indexGroup(err, result);
                            });
                        });
                        collectionGroup(err, collection);
                    });
                });
            },
            function done(err, result) {
                if (err) throw err;
                $this.debug('schema|createCollections|done|result=' + util.inspect(result));
                next(err, result);
            }
        );
    }
};

module.exports = SimpleMongo;
