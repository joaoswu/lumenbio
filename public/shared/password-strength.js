/**
 * Password strength scorer — shared by the client meter and server validation.
 * Returns { score: 0..4, label, percent, checks }.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PasswordStrength = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const COMMON = [
    'password', 'password1', '12345678', '123456789', '1234567890', 'qwerty',
    'qwerty123', '111111', 'iloveyou', 'admin', 'welcome', 'monkey', 'dragon',
    'abc123', 'letmein', 'football', 'princess', 'sunshine', 'lumenbio'
  ];

  function score(pw) {
    pw = pw || '';
    const checks = {
      length: pw.length >= 8,
      long: pw.length >= 12,
      lower: /[a-z]/.test(pw),
      upper: /[A-Z]/.test(pw),
      number: /[0-9]/.test(pw),
      symbol: /[^A-Za-z0-9]/.test(pw)
    };

    let s = 0;
    if (checks.length) s++;
    if (checks.lower && checks.upper) s++;
    if (checks.number) s++;
    if (checks.symbol) s++;
    if (checks.long) s++;

    // Penalties
    if (pw.length < 8) s = Math.min(s, 1);
    if (COMMON.includes(pw.toLowerCase())) s = 0;
    if (/^(.)\1+$/.test(pw)) s = 0;            // all same char
    if (/^[0-9]+$/.test(pw)) s = Math.min(s, 1); // digits only

    s = Math.max(0, Math.min(4, s));
    const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
    return { score: s, label: labels[s], percent: (s / 4) * 100, checks };
  }

  return { score };
}));
