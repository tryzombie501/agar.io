/*global -$ */
'use strict';
// generated on 2015-05-27 using generator-gulp-webapp 0.3.0
var gulp = require('gulp');
var browserSync = require('browser-sync');
var reload = browserSync.reload;

gulp.task('serve', function () {
  browserSync({
    notify: false,
    port: 80,
    server: {
      baseDir: ['app']
    }
  });

  // watch for changes
  gulp.watch([
    'app/*'
  ]).on('change', reload);
});

gulp.task('default', function () {
  gulp.start('serve');
});
