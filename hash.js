const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.log('Usage: node hash.js <your-password-here>');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('Hashed password:', hash);