const express = require('express');
const path = require('path');
const routes = require('./routes');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const redis = require('redis');
const flash = require('connect-flash');
const i18n = require('i18n');
require('dotenv').config();

const { startTelegramBot } = require('./utils/telegram');
startTelegramBot(); // run once when server starts

const compression = require('compression');
const app = express();
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers['accept-encoding']?.includes('br')) {
        res.setHeader('Content-Encoding', 'br');
        return true;
      }
      return compression.filter(req, res);
    },
    brotli: { enabled: true, zlib: {} }, // Brotli settings
  })
);

// i18n configuration
i18n.configure({
  locales: ['en', 'ko', 'ja', 'zh'], // Supported languages including Chinese
  directory: path.join(__dirname, 'locales'), // Directory where translation files are stored
  defaultLocale: 'en', // Default language
  cookie: 'lang', // Store language preference in a cookie
  queryParameter: 'lang', // Allow the language to be passed in the query string
  autoReload: true, // Automatically reload translation files when changed
  syncFiles: true, // Sync translation files with the current configuration
  objectNotation: true // Use object notation to access translations
});

// Middleware setup
app.use(cookieParser());
app.use(i18n.init);

// Middleware to set the language for each request
app.use((req, res, next) => {
  const lang = req.cookies.lang || 'en'; // Default to English if no language cookie is set
  i18n.setLocale(req, lang); // Set the language for the current request
  res.locals.currentLang = lang; // Make the current language available in the view templates
  next();
});

// Body parser middleware for handling form submissions
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  legacyMode: true,
});

redisClient.connect().catch(console.error); // Handles connection errors

redisClient.on('connect', () => {
  console.log('Redis connected successfully!');
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
  }
}));
app.use(flash());
app.use((req, res, next) => {
  res.locals.messages = req.flash();
  next();
});


app.use(passport.initialize());
app.use(passport.session());

// Set the view engine and routes
app.set('port', process.env.PORT || 4004);
app.set('views', path.join(__dirname, 'views'));
app.set("view engine", "ejs");

// Serve static files (images, CSS, JS, etc.)
app.use('/login/images/flags', express.static(path.join(__dirname, 'public/login/images/flags')));

// Language switch route
app.get('/change-lang', (req, res) => {
  const lang = req.query.lang;
  if (['en', 'ko', 'ja', 'zh'].includes(lang)) {
    res.cookie('lang', lang); // Set the selected language in the cookie
    i18n.setLocale(req, lang); // Apply language immediately after cookie update
  }
  res.redirect('back'); // Redirect back to the previous page
});

routes.forEach(router => app.use('/', router));
// Static file serving (for PassportUpload folder)
app.use('/PassportUpload', express.static(path.join(__dirname, 'PassportUpload')));
// Static file serving (for ReceiptUpload folder)
app.use('/ReceiptUpload', express.static(path.join(__dirname, 'ReceiptUpload')));

// Start the server
app.listen(app.get('port'), function () {
  console.log('Server started on port ' + app.get('port'));
});
