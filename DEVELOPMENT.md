# ShadSync Plugin - Development Guide

## 🔧 Version Control Setup

Your plugin now has a complete version control system with Git and automated versioning scripts.

### Current Status
- ✅ Git repository initialized
- ✅ v1.0.0 tagged as stable working version
- ✅ Backup scripts ready
- ✅ Version management tools created

## 🚀 Making Changes Safely

### Before Making Any Changes

1. **Check current status:**
   ```bash
   cd "/Users/robert/Documents/Figma Plugin/shadsync 2"
   git status
   ```

2. **Create a backup (optional but recommended):**
   ```bash
   ./backup.sh
   ```

### Development Workflow

1. **Make your changes** to any plugin files
2. **Test thoroughly** in Figma
3. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Brief description of what you changed"
   ```

### Creating New Versions

Use the automated version script:

```bash
# For small fixes/improvements
./version.sh patch "Fixed color parsing bug"

# For new features  
./version.sh minor "Added theme import/export"

# For major changes
./version.sh major "Complete UI redesign"
```

## 🔄 Reverting to Previous Versions

### If Something Breaks

1. **See all available versions:**
   ```bash
   git tag --list
   ```

2. **Revert to the last working version:**
   ```bash
   git checkout v1.0.0
   ```

3. **Go back to latest:**
   ```bash
   git checkout main
   ```

### Using Manual Backups

If you used the backup script:
```bash
ls "/Users/robert/Documents/Figma Plugin/shadsync-backups"
# Find your backup folder and run:
cd "/path/to/backup/folder"
./restore.sh
```

## 📋 Available Commands

### Version Management
- `./version.sh patch "description"` - Bug fixes (1.0.0 → 1.0.1)
- `./version.sh minor "description"` - New features (1.0.0 → 1.1.0)  
- `./version.sh major "description"` - Breaking changes (1.0.0 → 2.0.0)

### Backup & Restore
- `./backup.sh` - Create manual backup with timestamp
- `git tag --list` - List all versions
- `git checkout v1.0.0` - Switch to specific version
- `git checkout main` - Return to latest

### Git Commands
- `git status` - Check current changes
- `git log --oneline` - See change history
- `git diff` - See what changed since last commit

## 🎯 Plugin Development Tips

### Testing Changes
1. Save your files
2. In Figma: Plugins → Development → Reload plugin
3. Test the functionality
4. If it works: commit changes
5. If it breaks: revert or fix

### Safe Development
- Always test with sample CSS first
- Keep the `sample-variables.css` file updated with test data
- Make small changes and commit frequently
- Tag stable versions before major changes

### File Structure
```
shadsync 2/
├── manifest.json     # Plugin configuration
├── code.js          # Main plugin logic  
├── ui.html          # User interface
├── types.d.ts       # TypeScript definitions
├── sample-variables.css # Test data
├── README.md        # Documentation
├── VERSION_HISTORY.md # Version tracking
├── version.sh       # Automated versioning
├── backup.sh        # Manual backup tool
└── package.json     # Project metadata
```

## 🛠 Next Steps

Your plugin is now production-ready with proper version control. You can:

1. **Make incremental improvements** with confidence
2. **Add new features** knowing you can always revert
3. **Share with others** by giving them the entire folder
4. **Backup to cloud** by pushing to GitHub (optional)

### Optional: GitHub Setup
```bash
# Create a repository on GitHub, then:
git remote add origin https://github.com/yourusername/shadsync-plugin.git
git push -u origin main
git push --tags
```

## 🚨 Emergency Recovery

If everything breaks and you need to start over:

1. **Find the last working backup:**
   ```bash
   ls "/Users/robert/Documents/Figma Plugin/shadsync-backups"
   ```

2. **Restore it:**
   ```bash
   cd "/path/to/backup"
   ./restore.sh
   ```

3. **Or revert to v1.0.0:**
   ```bash
   git checkout v1.0.0
   git checkout -b main-fixed
   ```

Your plugin is now safe to develop with! 🎉
