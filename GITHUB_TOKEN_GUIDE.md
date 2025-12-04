# GitHub Personal Access Token Guide

## Required Permissions for Pushing Code

Para makapag-push sa repository, kailangan mo ng token na may **`repo`** permission.

## Step-by-Step: Create Token

### 1. Go to GitHub Token Settings
- Direct link: https://github.com/settings/tokens/new
- Or: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)

### 2. Generate New Token
- Click **"Generate new token"** → **"Generate new token (classic)"**

### 3. Configure Token
- **Note**: `eduvision-push` (or any name)
- **Expiration**: Choose (30 days, 90 days, or no expiration)

### 4. Select Permissions
**✅ REQUIRED:**
- Check **`repo`** (Full control of private repositories)
  - This includes:
    - `repo:status` - Access commit status
    - `repo_deployment` - Access deployment status
    - `public_repo` - Access public repositories
    - `repo:invite` - Access repository invitations
    - `security_events` - Access security events

**❌ NOT NEEDED:**
- `workflow` - Only if you need GitHub Actions
- `write:packages` - Only if you need to publish packages
- Other permissions - Not needed for basic push

### 5. Generate and Copy Token
- Click **"Generate token"** (green button)
- **⚠️ IMPORTANT**: Copy the token immediately!
  - Format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
  - You won't be able to see it again!
  - If you lose it, you need to create a new one

## How to Use the Token

### Option 1: Using Helper Script
```bash
cd /home/renz/Desktop/eduvision
./push_to_github.sh ghp_your_token_here
```

### Option 2: Manual Push
```bash
cd /home/renz/Desktop/eduvision
git push facerecog main --force

# When prompted:
# Username: clarenceportugal (or your GitHub username)
# Password: ghp_your_token_here (paste your token)
```

### Option 3: Store Token (Optional)
```bash
# Store token in git credential helper
git config --global credential.helper store

# Then push normally (enter token once, it will be saved)
git push facerecog main --force
```

## Security Notes
- ⚠️ Never share your token publicly
- ⚠️ Don't commit tokens to git
- ⚠️ Tokens have the same access as your password
- ✅ Use token expiration for security
- ✅ Revoke old tokens if compromised

## Troubleshooting

**Error: "Authentication failed"**
- Check if token has `repo` permission
- Make sure you copied the full token (starts with `ghp_`)
- Verify token hasn't expired

**Error: "Permission denied"**
- Make sure you have write access to the repository
- Check if repository exists: https://github.com/clarenceportugal/facerecog

**Error: "Repository not found"**
- Verify repository URL is correct
- Check if repository is private (needs token with `repo` permission)

