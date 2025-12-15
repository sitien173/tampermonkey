const gulp = require('gulp');
const babel = require('gulp-babel');
const uglify = require('gulp-uglify');
const sourcemaps = require('gulp-sourcemaps');
const del = require('del');

// Configuration
const config = {
  src: 'src/*.js',
  dist: 'dist'
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

// Production build (minified, console.log removed)
function buildProd() {
  return gulp.src(config.src)
    .pipe(babel({
      presets: [['@babel/preset-env', { targets: { firefox: '60', chrome: '70' } }]]
    }))
    .pipe(uglify({
      compress: { drop_console: true, dead_code: true, drop_debugger: true },
      mangle: { toplevel: false }
    }))
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
