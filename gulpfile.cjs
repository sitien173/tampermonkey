const gulp = require('gulp');
const babel = require('gulp-babel');
const uglify = require('gulp-uglify');
const sourcemaps = require('gulp-sourcemaps');
const del = require('del');
const rename = require('gulp-rename');
const eslint = require('gulp-eslint-new');
const prettier = require('gulp-prettier');
const through2 = require('through2');
const CleanCSS = require('clean-css');

const config = {
  src: 'src/*.js',
  dist: 'dist'
};

const userscriptHeaderRegex = /\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/;

function extractHeader(content) {
  const match = content.match(userscriptHeaderRegex);
  return match ? match[0] : null;
}

const fileHeaders = new Map();

function extractUserscriptHeader() {
  return through2.obj(function (file, enc, cb) {
    if (file.isBuffer()) {
      const content = file.contents.toString();
      const header = extractHeader(content);
      if (header) {
        fileHeaders.set(file.stem, header);
      }
    }
    cb(null, file);
  });
}

function prependUserscriptHeader() {
  return through2.obj(function (file, enc, cb) {
    if (file.isBuffer()) {
      const baseName = file.stem.replace('.user', '');
      const header = fileHeaders.get(baseName);
      if (header) {
        const content = file.contents.toString();
        file.contents = Buffer.from(header + '\n' + content);
      }
    }
    cb(null, file);
  });
}

const cleanCss = new CleanCSS({
  level: 2,
  format: false
});

function minifyCssInJs() {
  return through2.obj(function (file, enc, cb) {
    if (file.isBuffer()) {
      let content = file.contents.toString();

      // Pattern 1: Minify CSS in template literals (backtick strings) that look like CSS
      // Match template literals containing CSS-like content (selectors, properties)
      content = content.replace(/`([\s\S]*?)`/g, (match, cssContent) => {
        if (cssContent.includes('{') && cssContent.includes('}') && 
            (cssContent.includes(':') || cssContent.includes('@'))) {
          try {
            const result = cleanCss.minify(cssContent);
            if (result.styles && !result.errors?.length) {
              return '`' + result.styles + '`';
            }
          } catch {
          }
        }
        return match;
      });

      // Pattern 2: Minify inline style.cssText = `...` or style.cssText = '...'
      content = content.replace(
        /\.cssText\s*=\s*`([\s\S]*?)`/g,
        (match, cssContent) => {
          try {
            const wrapped = `.x{${cssContent}}`;
            const result = cleanCss.minify(wrapped);
            if (result.styles && !result.errors?.length) {
              const minified = result.styles.replace(/^\.x\{/, '').replace(/\}$/, '');
              return '.cssText=`' + minified + '`';
            }
          } catch{
          }
          return match;
        }
      );

      file.contents = Buffer.from(content);
    }
    cb(null, file);
  });
}

function clean() {
  return del([config.dist]);
}

function lint() {
  return gulp.src(config.src)
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
}

function formatCheck() {
  return gulp.src(config.src)
    .pipe(prettier.check());
}

function format() {
  return gulp.src(config.src)
    .pipe(prettier())
    .pipe(gulp.dest('src'));
}

function buildDev() {
  return gulp.src(config.src)
    .pipe(extractUserscriptHeader())
    .pipe(sourcemaps.init())
    .pipe(babel({ presets: ['@babel/preset-env'] }))
    .pipe(rename({ suffix: '.user', extname: '.js' }))
    .pipe(prependUserscriptHeader())
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(config.dist));
}

// Production build (minified, console.log removed, header preserved, CSS minified)
function buildProd() {
  return gulp.src(config.src)
    .pipe(extractUserscriptHeader())
    .pipe(minifyCssInJs())
    .pipe(babel({
      presets: [['@babel/preset-env', { targets: { firefox: '60', chrome: '70' } }]]
    }))
    .pipe(uglify({
      compress: { drop_console: true, dead_code: true, drop_debugger: true },
      mangle: { toplevel: false },
      output: {
        comments: false,
        beautify: false
      }
    }))
    .pipe(rename({ suffix: '.user', extname: '.js' }))
    .pipe(prependUserscriptHeader())
    .pipe(gulp.dest(config.dist));
}

function generateMeta() {
  return gulp.src(config.src)
    .pipe(through2.obj(function (file, enc, cb) {
      if (file.isBuffer()) {
        const content = file.contents.toString();
        const header = extractHeader(content);
        if (header) {
          file.contents = Buffer.from(header + '\n');
          cb(null, file);
        } else {
          cb();
        }
      } else {
        cb();
      }
    }))
    .pipe(rename({ suffix: '.meta', extname: '.js' }))
    .pipe(gulp.dest(config.dist));
}

function watch() {
  gulp.watch(config.src, gulp.series(lint, buildDev, generateMeta));
}

exports.clean = clean;
exports.lint = lint;
exports.format = format;
exports.formatCheck = formatCheck;
exports.meta = generateMeta;
exports.dev = gulp.series(clean, lint, buildDev, generateMeta);
exports.build = gulp.series(clean, lint, buildProd, generateMeta);
exports.watch = gulp.series(clean, lint, buildDev, generateMeta, watch);
exports.default = exports.build;
