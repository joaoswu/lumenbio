/**
 * Single source of the app secret (persisted at data/.jwt-secret).
 * Used for JWT signing and the page-unlock HMAC token.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = path.join(__dirname, '..', 'data');
const file = path.join(dir, '.jwt-secret');

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  try {
    if (fs.existsSync(file)) SECRET = fs.readFileSync(file, 'utf8').trim();
    else {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      SECRET = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(file, SECRET, 'utf8');
    }
  } catch (e) {
    SECRET = crypto.randomBytes(32).toString('hex');
  }
}

module.exports = {
  SECRET,
  unlockToken: (username) =>
    crypto.createHmac('sha256', SECRET).update('unlock:' + String(username).toLowerCase()).digest('hex')
};
