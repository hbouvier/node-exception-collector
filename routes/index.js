var notices           = require('./notices')

module.exports = function (config, app, options) {
    /////////////////////////////////////////////////////////////////////////////////////////
    //
    // public push notification routes
    notices(config, app, options);
};
