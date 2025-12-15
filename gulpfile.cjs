// gulpfile.js
const gulp = require('gulp');
const babel = require('gulp-babel');
const uglify = require('gulp-uglify');
const obfuscator = require('gulp-javascript-obfuscator');
const sourcemaps = require('gulp-sourcemaps');
const del = require('del');
const fs = require('fs');
const rename = require('gulp-rename');
const through2 = require('through2');

// Configuration
const config = {
  dist: 'dist',
  // Scripts to exclude from build
  excludeFiles: ['gulpfile.js'],
  // Glob pattern for source scripts
  srcPattern: '*.js'
};

// Get all Tampermonkey scripts (files with UserScript header at the start)
function getTampermonkeyScripts() {
  const files = fs.readdirSync('.').filter(file => {
    if (!file.endsWith('.js') || config.excludeFiles.includes(file)) {
      return false;
    }
    try {
      const content = fs.readFileSync(file, 'utf8');
      // Must start with UserScript header (allow whitespace/BOM at start)
      return /^\s*\/\/ ==UserScript==/.test(content);
    } catch {
      return false;
    }
  });
  return files;
}

// Extract userscript header from file content
function extractUserscriptHeader(content) {
  const headerMatch = content.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
  return headerMatch + '\n/* eslint-disable */' ? headerMatch[0] + '\n/* eslint-disable */' : null;
}

// Extract code body (everything after UserScript header)
function extractCodeBody(content) {
  const headerEnd = content.indexOf('// ==/UserScript==');
  if (headerEnd === -1) return content;
  return content.slice(headerEnd + '// ==/UserScript=='.length).trim();
}

// Obfuscator settings
const obfuscatorSettings = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  debugProtectionInterval: 0,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: true,
  shuffleStringArray: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

// Clean dist folder
function clean() {
  return del([config.dist]);
}

// Custom transform to preserve and reattach UserScript headers
function preserveHeader() {
  const headers = new Map();
  
  return {
    // Store headers before processing
    extract: through2.obj(function(file, enc, cb) {
      const content = file.contents.toString();
      const scriptHeader = extractUserscriptHeader(content);
      if (scriptHeader) {
        headers.set(file.basename, scriptHeader);
        // Replace content with just the code body
        file.contents = Buffer.from(extractCodeBody(content));
      }
      cb(null, file);
    }),
    // Reattach headers after processing
    reattach: through2.obj(function(file, enc, cb) {
      const originalName = file.basename.replace('.user.js', '.js');
      const scriptHeader = headers.get(originalName) || headers.get(file.basename);
      if (scriptHeader) {
        const processedCode = file.contents.toString();
        file.contents = Buffer.from(scriptHeader + '\n\n' + processedCode);
      }
      cb(null, file);
    })
  };
}

// Build task for development (with sourcemaps, no obfuscation)
function buildDev() {
  const scripts = getTampermonkeyScripts();
  console.log(`\nBuilding ${scripts.length} script(s) for development:`);
  scripts.forEach(s => console.log(`   • ${s}`));
  console.log('');

  const headerHandler = preserveHeader();
  
  return gulp.src(scripts)
    .pipe(headerHandler.extract)
    .pipe(sourcemaps.init())
    .pipe(babel({
      presets: ['@babel/preset-env']
    }))
    .pipe(rename({ suffix: '.user', extname: '.js' }))
    .pipe(headerHandler.reattach)
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(config.dist));
}

// Build task for production (obfuscated, minified)
function buildProd() {
  const scripts = getTampermonkeyScripts();
  console.log(`\nBuilding ${scripts.length} script(s) for production:`);
  scripts.forEach(s => console.log(`   • ${s}`));
  console.log('');

  const headerHandler = preserveHeader();

  return gulp.src(scripts)
    .pipe(headerHandler.extract)
    .pipe(babel({
      presets: [
        ['@babel/preset-env', {
          targets: { firefox: '60', chrome: '70' },
          modules: false
        }]
      ]
    }))
    .pipe(uglify({
      compress: {
        drop_console: false,
        dead_code: true,
        drop_debugger: true
      },
      mangle: {
        toplevel: false
      }
    }))
    .pipe(obfuscator(obfuscatorSettings))
    .pipe(rename({ suffix: '.user', extname: '.js' }))
    .pipe(headerHandler.reattach)
    .pipe(gulp.dest(config.dist));
}

// Build a single script (usage: gulp single --file script.js)
function buildSingle() {
  const scriptName = process.argv.find((arg, i) => process.argv[i - 1] === '--file');
  
  if (!scriptName) {
    console.error('Please specify a file: gulp single --file script.js');
    return Promise.resolve();
  }
  
  if (!fs.existsSync(scriptName)) {
    console.error(`File not found: ${scriptName}`);
    return Promise.resolve();
  }

  console.log(`\nBuilding single script: ${scriptName}\n`);

  const headerHandler = preserveHeader();

  return gulp.src(scriptName)
    .pipe(headerHandler.extract)
    .pipe(babel({
      presets: [
        ['@babel/preset-env', {
          targets: { firefox: '60', chrome: '70' },
          modules: false
        }]
      ]
    }))
    .pipe(uglify({
      compress: {
        drop_console: false,
        dead_code: true,
        drop_debugger: true
      },
      mangle: {
        toplevel: false
      }
    }))
    .pipe(obfuscator(obfuscatorSettings))
    .pipe(rename({ suffix: '.user', extname: '.js' }))
    .pipe(headerHandler.reattach)
    .pipe(gulp.dest(config.dist));
}

// Watch task for development
function watch() {
  const scripts = getTampermonkeyScripts();
  console.log(`\nWatching ${scripts.length} script(s) for changes...\n`);
  gulp.watch(scripts, buildDev);
}

// List all detected scripts
function list() {
  const scripts = getTampermonkeyScripts();
  console.log(`\nDetected ${scripts.length} Tampermonkey script(s):\n`);
  scripts.forEach((script, i) => {
    const content = fs.readFileSync(script, 'utf8');
    const nameMatch = content.match(/@name\s+(.+)/);
    const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
    console.log(`   ${i + 1}. ${script}`);
    console.log(`      └─ ${name}\n`);
  });
  return Promise.resolve();
}

// Export tasks
exports.clean = clean;
exports.list = list;
exports.dev = gulp.series(clean, buildDev);
exports.build = gulp.series(clean, buildProd);
exports.single = gulp.series(clean, buildSingle);
exports.watch = gulp.series(buildDev, watch);
exports.default = exports.build;
