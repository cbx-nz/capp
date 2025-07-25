const { hashPassword, comparePassword } = require('./hash');
const dotenv = require('dotenv');
dotenv.config();

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS) || 10;

// Hash at startup (not secure for real prod, but fine for demo)
const ADMIN_HASH = hashPassword(ADMIN_PASSWORD, SALT_ROUNDS);

function validateAdmin(username, password) {
    return username === ADMIN_USER && comparePassword(password, ADMIN_HASH);
}

module.exports = {
    validateAdmin
};