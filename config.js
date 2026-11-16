require('dotenv').config();

module.exports = {
  tournamentName: process.env.TOURNAMENT_NAME || 'বেপারী পাড়া প্রিমিয়ার লীগ, সিজন - ০২',
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  },
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bepari_para',

  bkash: {
    number: process.env.BKASH_NUMBER || '01700000000',
    amount: parseInt(process.env.BKASH_AMOUNT || '200', 10)
  },

  corsOrigin: process.env.CORS_ORIGIN || '',

  positions: ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LW', 'RW', 'CF', 'ST'],
  sizes: ['S', 'M', 'L', 'XL', 'XXL'],
  categories: ['', 'A', 'B', 'C', 'Star', 'Regular', 'Beginner'],

  // Brevo SMTP Setup
  smtp: {
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  },
  fromEmail: process.env.FROM_EMAIL || 'Bepari Para Premier League <no-reply@example.com>'
};
