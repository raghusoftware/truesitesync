// Build config for the precompiled Tailwind stylesheet (css/tailwind.css).
// The app previously compiled Tailwind in the browser (Play CDN runtime) on every
// launch; this produces the same CSS ahead of time. Default theme — matches the
// runtime, which had no custom config. Rebuild after adding new utility classes:
//   npx tailwindcss@3.4.4 -c tools/tailwind.config.cjs -i tools/tailwind.input.css -o css/tailwind.css --minify
module.exports = {
  content: ['./app.html', './js/**/*.js', '!./js/vendor/**'],
  theme: { extend: {} },
  plugins: [],
};
