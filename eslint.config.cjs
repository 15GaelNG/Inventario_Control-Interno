/**
 * ESLint (auditoría de código, 23-oct). Dos mundos:
 *   - la pantalla: los <script> de src/html/**.html (eslint-plugin-html), en el navegador;
 *   - el servidor: los .gs de src, en Apps Script (V8).
 * Lo de primer nivel es global entre archivos en los dos: tools/lint/globales.js lo junta al correr. Lo que nadie usa
 * entre archivos lo busca tools/lint/globales-sin-uso.js (ESLint solo ve un archivo a la vez).
 *
 *   npx eslint src            el reporte
 */
const js = require('@eslint/js');
const globals = require('globals');
const html = require('eslint-plugin-html');
const { pantalla, servidor } = require('./tools/lint/globales');

const REGLAS = {
  ...js.configs.recommended.rules,
  // Lo de primer nivel lo usan otros archivos: eso lo revisa globales-sin-uso.js, no esta regla
  'no-unused-vars': ['warn', { vars: 'local', args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
  // Cada archivo se ve a sí mismo en la lista de globales: no es una redeclaración
  'no-redeclare': ['error', { builtinGlobals: false }],
};

// Servicios de Apps Script (y los avanzados que activa appsscript.json)
const APPS_SCRIPT = Object.fromEntries([
  'SpreadsheetApp', 'DriveApp', 'DocumentApp', 'SlidesApp', 'FormApp', 'GmailApp', 'MailApp', 'CalendarApp',
  'Utilities', 'CacheService', 'LockService', 'PropertiesService', 'ScriptApp', 'Session', 'HtmlService',
  'ContentService', 'UrlFetchApp', 'Logger', 'Charts', 'XmlService', 'Browser', 'Drive', 'People', 'AdminDirectory',
  'Sheets', 'Docs', 'Slides', 'Gmail', 'Calendar', 'Blob', 'BigQuery', 'MimeType',
].map((n) => [n, 'readonly']));

module.exports = [
  { ignores: ['.construido/**', 'node_modules/**', 'legacy/**', 'pipeline/**', 'data/**'] },
  {
    files: ['src/**/*.html'],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      // Lo que carga Index.html por CDN: lucide (íconos), XLSX (Exportar), Chart y ChartDataLabels (panoramas)
      globals: { ...globals.browser, ...pantalla(), google: 'readonly', lucide: 'readonly', XLSX: 'readonly', Chart: 'readonly', ChartDataLabels: 'readonly' },
    },
    // 'https:\/\/…' va escapado a propósito: Apps Script corta un "//" literal como comentario (CLAUDE.md)
    rules: { ...REGLAS, 'no-useless-escape': 'off' },
  },
  {
    files: ['src/**/*.gs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      // LINEAS_CORRECCIONES_SEMILLA: opcional, la genera tools/correcciones-semilla.cjs (se pregunta con typeof)
      globals: { ...servidor(), ...APPS_SCRIPT, console: 'readonly', LINEAS_CORRECCIONES_SEMILLA: 'readonly' },
    },
    rules: REGLAS,
  },
];
