#!/usr/bin/env bash

# This is the order they'll be published in
packages="messaging,types,client"

########################################
## Helper functions

function get_latest_version {
  echo "$@" | tr ' ' '\n' | sort --version-sort --reverse | head -n 1
}

########################################
## Run some sanity checks to make sure we're really ready to npm publish

if [[ -n "`git status -s`" ]]
then echo "Aborting: Make sure your git repo is clean" && exit 1
fi

if [[ ! "`pwd | sed 's|.*/\(.*\)|\1|'`" =~ "indra" ]]
then echo "Aborting: Make sure you're in the indra project root" && exit 1
fi

package_names=""
package_versions=""

echo
for package in `echo $packages | tr ',' ' '`
do
  package_name="`cat modules/$package/package.json | grep '"name":' | awk -F '"' '{print $4}'`"
  package_version="0.0.11" #"`npm view $package_name version 2> /dev/null || echo "N/A"`"
  package_versions="$package_versions $package_version"
  package_names="$package_names $package_name@$package_version"
  echo "Found previously published npm package: $package_name@$package_version"
done
echo

highest_version="`get_latest_version $package_versions`"

echo "What version of @connext/{$packages} packages are we publishing?"
echo "Currently, latest version: $highest_version"
read -p "> " -r
echo
target_version="$REPLY" # get version from user input

if [[ -z "$target_version" ]]
then echo "Aborting: A new, unique version is required" && exit 1
elif [[ "$package_versions" =~ "$target_version" ]]
then echo "Aborting: A new, unique version is required" && exit 1
elif [[ "`get_latest_version $package_versions $target_version`" != "$target_version" ]]
then echo "Aborting: The new version should be bigger than old ones" && exit 1
fi

echo "Confirm: we'll publish the current branch to npm as @connext/{$packages}@$target_version (y/n)?"
read -p "> " -r
echo
if [[ ! "$REPLY" =~ ^[Yy]$ ]]
then echo "Aborting by user request" && exit 1 # abort!
fi

echo "Let's go"
cd modules

for package in $package_names
do
  echo
  echo "Dealing w package: $package"
  fullname="${package%@*}"
  nickname="${fullname#*/}"
  version="$target_version"
  echo "Updating $nickname package version to $version"
  cd $nickname
  mv package.json .package.json
  cat .package.json | sed 's/"version": ".*"/"version": "'$version'"/' > package.json
  rm .package.json
  echo "Publishing $fullname"
  npm publish --access=public
  echo
  cd ..
  for module in `ls */package.json`
  do
    echo "Updating $fullname references in $module"
    cd ${module%/*}
    mv package.json .package.json
    cat .package.json | sed 's|"'"$fullname"'": ".*"|"'"$fullname"'": "'$version'"|' > package.json
    rm .package.json
    cd ..
  done
done

cd ..

echo
echo "Commiting & tagging our changes"
echo

git add .
git commit --allow-empty -m "npm publish @connext/{$packages}@$target_version"
git tag npm-publish-$target_version
git push origin HEAD --no-verify
git push origin messaging-$target_version --no-verify
