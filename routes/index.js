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
    require('./telegramData'),
    require('./fnb_hotel')
];
  