# Git Setup Guide

Quick guide to prepare and push ProcureFlow to GitHub.

## 📋 Pre-Push Checklist

Before pushing to GitHub, ensure:

- [x] `.gitignore` is configured
- [x] `.env.example` created (without sensitive data)
- [x] `.env` is in `.gitignore` (never commit real credentials!)
- [x] README.md is complete
- [x] LICENSE file added
- [x] CONTRIBUTING.md added
- [x] All sensitive data removed from code

## 🚀 Step-by-Step Git Setup

### 1. Initialize Git Repository (if not already done)

```bash
cd /path/to/procureflow
git init
```

### 2. Verify .gitignore is Working

```bash
# Check what will be committed
git status

# Verify .env is ignored
git check-ignore -v .env

# Should output: .gitignore:X:.env    .env
```

### 3. Review Files to be Committed

```bash
# See what will be added
git add --dry-run .

# Important files that SHOULD be included:
✅ README.md
✅ .gitignore
✅ .env.example
✅ docker-compose.yml
✅ LICENSE
✅ CONTRIBUTING.md
✅ All source code files
✅ Dockerfiles
✅ requirements.txt files
✅ package.json files

# Files that SHOULD NOT be included:
❌ .env (real credentials)
❌ node_modules/
❌ __pycache__/
❌ .next/
❌ *.log
❌ Database dumps
❌ Uploaded files
```

### 4. Add Files to Git

```bash
# Add all files (gitignore will exclude sensitive ones)
git add .

# Or add selectively
git add README.md
git add .gitignore
git add .env.example
git add docker-compose.yml
git add services/
git add frontend/
git add databases/
```

### 5. Create Initial Commit

```bash
git commit -m "Initial commit: ProcureFlow Multi-Agent Procurement System

- Complete 4-agent pipeline (OCR, Inventory, Vendor, Procurement)
- Next.js dashboard with real-time monitoring
- Multi-database architecture (PostgreSQL + MySQL)
- Kafka event streaming
- Docker Compose orchestration
- Comprehensive documentation"
```

### 6. Create GitHub Repository

**Option A: Using GitHub CLI**

```bash
# Install GitHub CLI if needed
# https://cli.github.com/

# Login
gh auth login

# Create repository
gh repo create procureflow --public --description "AI-Powered Multi-Agent Procurement System"

# Push code
git branch -M main
git push -u origin main
```

**Option B: Using Web Interface**

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `procureflow`
3. Description: `AI-Powered Multi-Agent Procurement System`
4. Choose public or private
5. **DO NOT** initialize with README (we already have one)
6. Click "Create repository"

### 7. Connect and Push

```bash
# Add remote
git remote add origin https://github.com/YOUR_USERNAME/procureflow.git

# Verify remote
git remote -v

# Push to GitHub
git branch -M main
git push -u origin main
```

## 🔒 Security Check Before Push

### Final Security Verification

Run this checklist:

```bash
# 1. Check for exposed credentials
grep -r "password" --include="*.py" --include="*.ts" --include="*.js" --exclude-dir=node_modules

# 2. Check for API keys in code
grep -r "api_key" --include="*.py" --include="*.ts" --include="*.js" --exclude-dir=node_modules

# 3. Verify .env is not tracked
git ls-files | grep "^\.env$"
# Should return nothing!

# 4. Check for sensitive files
git ls-files | grep -E "\.(log|key|pem|p12)$"
# Should return nothing!
```

### Remove Accidentally Committed Secrets

If you accidentally committed secrets:

```bash
# Remove file from Git (keeps local copy)
git rm --cached .env

# Remove from all history (use with caution!)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (only if you're the only one with the repo)
git push origin --force --all
```

## 📝 Recommended Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Examples:**

```bash
git commit -m "feat(agent2): add industry auto-detection"
git commit -m "fix(frontend): resolve workflow polling issue"
git commit -m "docs(readme): update installation instructions"
```

## 🌿 Branch Strategy

### Create Development Branch

```bash
# Create and switch to dev branch
git checkout -b dev

# Push to GitHub
git push -u origin dev
```

### Feature Branch Workflow

```bash
# Create feature branch
git checkout -b feature/agent-improvements

# Make changes and commit
git add .
git commit -m "feat(agent3): improve vendor scoring algorithm"

# Push feature branch
git push -u origin feature/agent-improvements

# Create pull request on GitHub
gh pr create --title "Improve vendor scoring" --body "Enhanced scoring with new metrics"
```

## 📦 Release Workflow

### Create a Release

```bash
# Tag the release
git tag -a v1.0.0 -m "Release version 1.0.0 - Initial production release"

# Push tags
git push origin --tags

# Create GitHub release
gh release create v1.0.0 --title "v1.0.0 - Initial Release" --notes "
## Features
- 4-agent procurement pipeline
- Real-time monitoring dashboard
- Multi-industry support
- Event-driven architecture

## Installation
See [README.md](README.md) for installation instructions.
"
```

## 🔄 Keeping Fork Updated

If others fork your repository, they can stay updated:

```bash
# Add upstream remote
git remote add upstream https://github.com/YOUR_USERNAME/procureflow.git

# Fetch upstream changes
git fetch upstream

# Merge upstream main into local main
git checkout main
git merge upstream/main

# Push updates
git push origin main
```

## 🛠️ Useful Git Commands

```bash
# View commit history
git log --oneline --graph --all

# View changes
git diff

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# View repository size
git count-objects -vH

# Clean up
git gc --aggressive
```

## 📊 Repository Settings (on GitHub)

After pushing, configure these settings:

### 1. About Section
- Add description: "AI-Powered Multi-Agent Procurement System"
- Add website: (your demo URL)
- Add topics: `ai`, `agents`, `procurement`, `microservices`, `kafka`, `docker`, `fastapi`, `nextjs`

### 2. Enable Features
- ✅ Issues
- ✅ Discussions
- ✅ Projects (optional)
- ✅ Wiki (optional)

### 3. Branch Protection
- Protect `main` branch
- Require pull request reviews
- Require status checks to pass

### 4. Add Labels
- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed

### 5. Create Issue Templates

Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: bug
---

**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior

**Expected behavior**
What you expected to happen

**Screenshots**
If applicable, add screenshots

**Environment**
- OS: [e.g., Windows 11]
- Docker version: [e.g., 24.0.5]
- Browser: [e.g., Chrome 118]
```

## ✅ Post-Push Checklist

After pushing to GitHub:

- [ ] Repository is public/private as intended
- [ ] README displays correctly
- [ ] All links in README work
- [ ] License is recognized by GitHub
- [ ] `.env` file is NOT in repository
- [ ] GitHub Actions/CI setup (if applicable)
- [ ] Repository topics added
- [ ] Repository description added
- [ ] Star your own repo 😄

## 🎉 Share Your Project

After pushing:

1. **Share on social media**
   - Twitter/X
   - LinkedIn
   - Reddit (r/programming, r/docker, r/selfhosted)

2. **Submit to lists**
   - Awesome lists (awesome-docker, awesome-fastapi, etc.)
   - Product Hunt
   - Hacker News

3. **Write a blog post**
   - Dev.to
   - Medium
   - Your personal blog

---

**Ready to push? Run these final commands:**

```bash
# Final check
git status

# Add everything
git add .

# Commit
git commit -m "Initial commit: Complete procurement system"

# Push
git push -u origin main
```

**🚀 Your project is now on GitHub!**

Share it: `https://github.com/YOUR_USERNAME/procureflow`
