#!/bin/bash

# ShadSync Plugin Version Management Script
# Usage: ./version.sh [patch|minor|major] "description of changes"

VERSION_TYPE=${1:-patch}
DESCRIPTION=${2:-"Version update"}

echo "🚀 ShadSync Plugin Version Manager"
echo "=================================="

# Check if we have uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  You have uncommitted changes. Please commit or stash them first."
    echo ""
    echo "Current changes:"
    git status --porcelain
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(grep '"version"' package.json | cut -d'"' -f4)
echo "📋 Current version: $CURRENT_VERSION"

# Calculate new version
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

case $VERSION_TYPE in
    patch)
        PATCH=$((PATCH + 1))
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    *)
        echo "❌ Invalid version type. Use: patch, minor, or major"
        exit 1
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "🎯 New version: $NEW_VERSION"
echo "📝 Description: $DESCRIPTION"
echo ""

# Confirm
read -p "Continue with version $NEW_VERSION? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled"
    exit 1
fi

# Update package.json version
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json

# Update VERSION_HISTORY.md
CURRENT_DATE=$(date +"%Y-%m-%d")
TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" << EOF
# ShadSync Plugin Versions

## Version History

### v$NEW_VERSION - $DESCRIPTION ✅ (Current)
- **Date**: $CURRENT_DATE
- **Changes**: $DESCRIPTION
- **Status**: ✅ New version
- **Files**: Updated from v$CURRENT_VERSION

EOF

# Append the rest of the version history (skip the header and current version)
tail -n +6 VERSION_HISTORY.md >> "$TEMP_FILE"
mv "$TEMP_FILE" VERSION_HISTORY.md

# Commit changes
git add package.json VERSION_HISTORY.md
git commit -m "v$NEW_VERSION - $DESCRIPTION"
git tag "v$NEW_VERSION"

echo ""
echo "✅ Version $NEW_VERSION created successfully!"
echo "📦 Files updated: package.json, VERSION_HISTORY.md"
echo "🏷️  Git tag created: v$NEW_VERSION"
echo ""
echo "🔄 To revert to previous version if needed:"
echo "   git checkout v$CURRENT_VERSION"
echo ""
echo "📋 To see all versions:"
echo "   git tag --list"
echo ""
echo "🔄 To switch between versions:"
echo "   git checkout v$NEW_VERSION    # Latest"
echo "   git checkout v$CURRENT_VERSION    # Previous working"
