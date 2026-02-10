// routes/index.js
module.exports = [
    require('./auth').router,
    require('./statistics'),
    require('./accounts'),
    require('./gamebook'),
    require('./expense'),
    require('./booking'),
    require('./commission'),
    require('./changeGame'),
    require('./dashboard'),
    require('./activity_log'),
    require('./routes.js'), // pageRouter with page routes like /activity_log, /game_list, etc.
    require('./telegramData'),
    require('./fnb_hotel'),
    require('./announcement') // Keep for POST /announcement/create route
];
  