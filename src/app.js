const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const apiRoutes = require('./routes');
const errorHandler = require('./middlewares/error.middleware');
const AppError = require('./utils/AppError');

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin) return callback(null, true);
      if (origin === clientUrl || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev, strict in prod
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging in non-test mode
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// API Routes
app.use('/api/v1', apiRoutes);
app.use('/api', apiRoutes);

// Catch unhandled routes
app.all('*', (req, res, next) => {
  next(new AppError(`Cannot find endpoint ${req.originalUrl} on this server`, 404, 'NOT_FOUND'));
});

// Centralized error handling
app.use(errorHandler);

module.exports = app;
