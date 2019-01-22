set -ex

curl -o .prettierrc https://raw.githubusercontent.com/sharelatex/web-sharelatex/master/.prettierrc

git add .
git commit -m "Decaffeinate: add prettier rc files"

npx bulk-decaffeinate convert --dir app/coffee

npx bulk-decaffeinate clean

git mv app/coffee app/js

git commit -m "Rename app/coffee dir to app/js"

npx prettier-eslint 'app/js/**/*.js' --write

git add .
git commit -m "Prettier: convert app/js decaffeinated files to Prettier format"

npx bulk-decaffeinate convert --dir test/unit/coffee

npx bulk-decaffeinate clean

git mv test/unit/coffee test/unit/js

git commit -m "Rename test/unit/coffee to test/unit/js"

npx prettier-eslint 'test/unit/js/**/*.js' --write

git add .
git commit -m "Prettier: convert test/unit decaffeinated files to Prettier format"

npx bulk-decaffeinate convert --dir test/acceptance/coffee

npx bulk-decaffeinate clean

git mv test/acceptance/coffee test/acceptance/js

git commit -m "Rename test/acceptance/coffee to test/acceptance/js"

npx prettier-eslint 'test/acceptance/js/**/*.js' --write

git add .
git commit -m "Prettier: convert test/acceptance decaffeinated files to Prettier format"

git mv app.coffee app.js
git mv Gruntfile.coffee Gruntfile.js
git mv config/settings.defaults.coffee config/settings.defaults.js
git mv cluster.coffee cluster.js

git commit -m "Rename individual coffee files to js files"

decaffeinate app.js
decaffeinate Gruntfile.js
decaffeinate config/settings.defaults.js
decaffeinate cluster.js

git add .
git commit -m "Decaffeinate: convert individual files to js"

npx prettier-eslint 'app.js' 'Gruntfile.js' 'config/settings.defaults.js' 'cluster.js' --write

git add .
git commit -m "Prettier: convert individual decaffeinated files to Prettier format"

echo "done"
