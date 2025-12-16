const gulp = require('gulp');
const babel = require('gulp-babel');
const sourcemaps = require('gulp-sourcemaps');
const del = require('del');
const stripComments = require('gulp-strip-comments');

// Configuration
const config = {
  src: 'src/*.js',
  dist: 'dist'
};

// Clean dist folder
function clean() {
  return del([config.dist]);
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
// - Removes comments
// - Keeps code readable and properly formatted
function buildProd() {
  return gulp.src(config.src)
    .pipe(babel({
      presets: [['@babel/preset-env', {
        targets: { firefox: '60', chrome: '70' },
        modules: false  // Preserve ES modules
      }]],
      plugins: [
        ['transform-remove-console', { exclude: ['error', 'warn'] }]
      ]
    }))
    .pipe(stripComments({ safe: true }))  // Remove comments, preserve important ones
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
