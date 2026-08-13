cd hugo-assistant   # or your local clone

# 1. New branch
git checkout -b feature/my-change

# 2. Edit files, then commit
git add .
git commit -m "Describe your change"

# 3. Push the branch
git push -u origin feature/my-change






# 1. Install GitHub CLI (Mac)
brew install gh

# 2. Device login (browser activation)
gh auth login --hostname github.com --git-protocol https --web

# 3. Follow the prompts:
#    - copy the one-time code
#    - open https://github.com/login/device
#    - paste the code and approve

# 4. Let gh configure git
gh auth setup-git

# 5. Clone / pull / push as usual
git clone https://github.com/manojvijay197-dotcom/hugo-assistant.git
cd hugo-assistant
git checkout patch-commit-method-file-added
git push   # works after login
