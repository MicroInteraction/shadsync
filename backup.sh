#!/bin/bash

# ShadSync Plugin Backup Script
# Creates a timestamped backup of the current working plugin

PLUGIN_DIR="/Users/robert/Documents/Figma Plugin/shadsync 2"
BACKUP_DIR="/Users/robert/Documents/Figma Plugin/shadsync-backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
VERSION="v1.0.0"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create version-specific backup
BACKUP_PATH="$BACKUP_DIR/${VERSION}_${TIMESTAMP}"
mkdir -p "$BACKUP_PATH"

# Copy all plugin files
cp "$PLUGIN_DIR/manifest.json" "$BACKUP_PATH/"
cp "$PLUGIN_DIR/code.js" "$BACKUP_PATH/"
cp "$PLUGIN_DIR/ui.html" "$BACKUP_PATH/"
cp "$PLUGIN_DIR/README.md" "$BACKUP_PATH/"
cp "$PLUGIN_DIR/types.d.ts" "$BACKUP_PATH/"
cp "$PLUGIN_DIR/VERSION_HISTORY.md" "$BACKUP_PATH/"

echo "✅ Backup created: $BACKUP_PATH"
echo "📁 Contains: manifest.json, code.js, ui.html, README.md, types.d.ts, VERSION_HISTORY.md"

# Create a restore script
cat > "$BACKUP_PATH/restore.sh" << EOF
#!/bin/bash
# Restore script for ShadSync Plugin $VERSION

PLUGIN_DIR="/Users/robert/Documents/Figma Plugin/shadsync 2"
BACKUP_DIR="$BACKUP_PATH"

echo "🔄 Restoring ShadSync Plugin $VERSION..."
cp "\$BACKUP_DIR/manifest.json" "\$PLUGIN_DIR/"
cp "\$BACKUP_DIR/code.js" "\$PLUGIN_DIR/"
cp "\$BACKUP_DIR/ui.html" "\$PLUGIN_DIR/"
cp "\$BACKUP_DIR/README.md" "\$PLUGIN_DIR/"
cp "\$BACKUP_DIR/types.d.ts" "\$PLUGIN_DIR/"
cp "\$BACKUP_DIR/VERSION_HISTORY.md" "\$PLUGIN_DIR/"

echo "✅ Plugin restored to $VERSION"
echo "🔧 Reload the plugin in Figma to use the restored version"
EOF

chmod +x "$BACKUP_PATH/restore.sh"
echo "📄 Restore script created: $BACKUP_PATH/restore.sh"
