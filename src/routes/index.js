const express = require('express');
const router = express.Router();

// Import route modules
const userRoutes = require('./users');
const projectRoutes = require('./projects');
const timeRoutes = require('./time');
const authRoutes = require('./auth');

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/time', timeRoutes);

// Root endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TimeDoctor API Integration',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      projects: '/api/projects',
      time: '/api/time'
    }
  });
});

module.exports = router;