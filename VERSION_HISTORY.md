# ShadSync Plugin Versions

## Version History

### v1.0.0 - Initial Release ✅ (Current - Working)
- **Date**: 2025-01-08
- **Features**:
  - CSS to Figma Variables conversion
  - Single collection with Light/Dark modes
  - Hex and HSL color support
  - Auto-stops after `sidebar-ring`
  - Variable usage detection
- **Status**: ✅ Stable and working
- **Files**: All current files in this state

### Backup Instructions
1. Copy entire plugin folder to `shadsync-backups/v1.0.0/`
2. Before making changes, increment version number
3. Test thoroughly before considering stable

## Git Setup (Recommended)

```bash
# Initialize git repository
cd "/Users/robert/Documents/Figma Plugin/shadsync 2"
git init

# Add all files
git add .

# Create first commit
git commit -m "v1.0.0 - Initial working version with Light/Dark modes"

# Create version tag
git tag v1.0.0
```

## Future Workflow

Before making changes:
```bash
# Create new version tag
git add .
git commit -m "v1.1.0 - Description of changes"
git tag v1.1.0
```

To revert to working version:
```bash
git checkout v1.0.0
```
