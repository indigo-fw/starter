@echo off
echo === Demo fix push script ===
echo.
cd /d E:\projects\sweetai\indigo

echo Removing stale git lock if present...
if exist .git\index.lock del /f .git\index.lock 2>nul

echo Staging resolved files...
git add .github\workflows\bootstrap-demo.yml .github\workflows\deploy-demo.yml docker-compose.prod.yml
if errorlevel 1 (
  echo FAILED to stage — try closing VS Code git operations and rerun
  pause
  exit /b 1
)

echo Committing (completing merge)...
git commit -m "fix(demo): resolve conflicts, add env_file, sync compose on deploy

- bootstrap-demo.yml: resolve merge conflicts (HEAD), add step 3.5 to
  upsert NEXT_PUBLIC_APP_URL + BETTER_AUTH_URL = demo.indigo-fw.dev
- docker-compose.prod.yml: add env_file: .env so all vars including
  INDIGO_ROBOTS_PROFILE reach the container; switch to GHCR image
- deploy-demo.yml: checkout + scp-action syncs compose to VPS on deploy"
if errorlevel 1 (
  echo FAILED to commit
  pause
  exit /b 1
)

echo Pushing to GitHub...
git push
if errorlevel 1 (
  echo FAILED to push
  pause
  exit /b 1
)

echo.
echo === Done! Now go to GitHub Actions and dispatch bootstrap-demo workflow ===
pause
