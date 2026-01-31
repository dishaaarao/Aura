#!/bin/bash
# Simple script to sync changes to GitHub
# Usage: ./sync_git.sh "Your commit message"

if [ -z "$1" ]
then
  echo "Usage: ./sync_git.sh \"Your commit message\""
  exit 1
fi

git add .
git commit -m "$1"
git push
echo "✅ Changes synced to GitHub!"
