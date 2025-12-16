const gulp = require('gulp');
const babel = require('gulp-babel');
const sourcemaps = require('gulp-sourcemaps');
const del = require('del');
const stripComments = require('gulp-strip-comments');
const through2 = require('through2');
const eslint = require('gulp-eslint-new');
const gulpPrettier = require('gulp-prettier');
const prettier = gulpPrettier.default;

// Configuration
const config = {
  src: 'src/*.js',
  dist: 'export'
};

// Extract UserScript header from source
function extractUserScriptHeader() {
  return through2.obj(function(file, enc, cb) {
    if (file.isBuffer()) {
      const content = file.contents.toString();
      const headerMatch = content.match(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/);
      if (headerMatch) {
        file.userScriptHeader = headerMatch[0];
      }
    }
    cb(null, file);
  });
}

// Restore UserScript header to output
function restoreUserScriptHeader() {
  return through2.obj(function(file, enc, cb) {
    if (file.isBuffer() && file.userScriptHeader) {
      const content = file.contents.toString();
      file.contents = Buffer.from(file.userScriptHeader + '\n' + content);
    }
    cb(null, file);
  });
}

// Remove empty lines (keeps max 1 empty line between code blocks)
function removeEmptyLines() {
  return through2.obj(function(file, enc, cb) {
    if (file.isBuffer()) {
      let content = file.contents.toString();
      // Replace multiple consecutive empty lines with a single empty line
      content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
      // Remove empty lines at the start of the file
      content = content.replace(/^\s*\n+/, '');
      file.contents = Buffer.from(content);
    }
    cb(null, file);
  });
}

// Clean dist folder
function clean() {
  return del([config.dist]);
}

// Lint source files with ESLint
function lint() {
  return gulp.src(config.src)
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
}

// Format source files with Prettier (writes back to src)
function format() {
  return gulp.src(config.src)
    .pipe(prettier())
    .pipe(gulp.dest('src'));
}

// Check formatting without modifying files
function formatCheck() {
  return gulp.src(config.src)
    .pipe(prettier.check())
    .on('error', function() {
      console.error('Prettier check failed. Run "npx gulp format" to fix formatting.');
      process.exit(1);
    });
}

// Development build (with sourcemaps)
function buildDev() {
  return gulp.src(config.src)
    .pipe(sourcemaps.init())
    .pipe(babel({ presets: ['@babel/preset-env'] }))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(config.dist));
}

// Production build for Greasy Fork (readable, not minified)
// - Removes console.log/debug/info statements
// - Removes comments (except UserScript header)
// - Keeps code readable and properly formatted
function buildProd() {
  return gulp.src(config.src)
    .pipe(extractUserScriptHeader())
    .pipe(babel({
      presets: [['@babel/preset-env', {
        targets: { firefox: '60', chrome: '70' },
        modules: false  // Preserve ES modules
      }]],
      plugins: [
        ['transform-remove-console', { exclude: ['error', 'warn'] }]
      ]
    }))
    .pipe(stripComments({ safe: true }))  // Remove comments
    .pipe(removeEmptyLines())  // Remove excessive empty lines
    .pipe(restoreUserScriptHeader())  // Restore UserScript header
    .pipe(gulp.dest(config.dist));
}

// Watch for changes
function watch() {
  gulp.watch(config.src, buildDev);
}

// Export tasks
exports.clean = clean;
exports.lint = lint;
exports.format = format;
exports.formatCheck = formatCheck;
exports.dev = gulp.series(clean, buildDev);
exports.build = gulp.series(lint, formatCheck, clean, buildProd);
exports.watch = gulp.series(clean, buildDev, watch);
exports.default = exports.build;
