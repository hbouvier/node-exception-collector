var notices           = require('./notices'),
    applications      = require('./applications');

module.exports = function (config, app, options) {
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // public push notification routes
    applications(config, app, options);
    notices(config, app, options);
};
