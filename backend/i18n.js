/**
 * Backend i18n helper
 * Loads translation catalogs and exposes a t() function for server-side string lookup.
 */

const fs = require('fs');
const path = require('path');

const SUPPORTED = ['es', 'en'];
const LOCALES_DIR = path.join(__dirname, '../locales');

const catalogs = {};
for (const lang of SUPPORTED) {
  catalogs[lang] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${lang}.json`), 'utf8'));
}

/**
 * Translate a dot-separated key for the given language.
 * Falls back to 'es' if lang is unsupported. Returns the key on missing translation.
 * Supports {var} interpolation in values.
 */
function t(key, lang = 'es', vars = {}) {
  const catalog = catalogs[SUPPORTED.includes(lang) ? lang : 'es'];
  const parts = key.split('.');
  let val = catalog;
  for (const p of parts) val = val?.[p];
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

/**
 * Read the current language from the db config, defaulting to 'es'.
 */
function getLanguage(db) {
  return db.getConfig('language') || 'es';
}

module.exports = { t, getLanguage, SUPPORTED };
