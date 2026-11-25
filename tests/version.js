// app.js의 APP_VERSION과 sw.js의 CACHE가 같아야 휴대폰에 새 화면이 뜸
const fs = require('fs'), path = require('path'), assert = require('assert');
const a = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const s = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8').match(/CACHE = '([^']+)'/)[1];
assert.equal(a, s, 'APP_VERSION과 sw.js CACHE를 같게');
console.log('VERSION OK ' + a);
