const gulp = require('gulp');
const babel = require('gulp-babel');
const uglify = require('gulp-uglify');
const obfuscator = require('gulp-javascript-obfuscator');
const sourcemaps = require('gulp-sourcemaps');
const del = require('del');

// Configuration
const config = {
  src: 'src/*.js',
  dist: 'dist'
};

// Obfuscator settings
const obfuscatorSettings = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
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
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

// Clean dist folder
function clean() {
  return del([config.dist]);
}

// Development build (with sourcemaps, no obfuscation)
function buildDev() {
  return gulp.src(config.src)
    .pipe(sourcemaps.init())
    .pipe(babel({ presets: ['@babel/preset-env'] }))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(config.dist));
}

// Production build (minified + obfuscated)
function buildProd() {
  return gulp.src(config.src)
    .pipe(babel({
      presets: [['@babel/preset-env', { targets: { firefox: '60', chrome: '70' } }]]
    }))
    .pipe(uglify({
      compress: { drop_console: false, dead_code: true, drop_debugger: true },
      mangle: { toplevel: false }
    }))
    .pipe(obfuscator(obfuscatorSettings))
    .pipe(gulp.dest(config.dist));
}

// Watch for changes
function watch() {
  gulp.watch(config.src, buildDev);
}

// Export tasks
exports.clean = clean;
exports.dev = gulp.series(clean, buildDev);
exports.build = gulp.series(clean, buildProd);
exports.watch = gulp.series(clean, buildDev, watch);
exports.default = exports.build;
