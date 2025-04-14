#! /bin/bash

# Check the download folder for cursor app images: cursor*.appimage
appImage=$(find ~/Downloads -type f -iname "cursor*.appimage")

# If the appImage doesn't exist, exit
if [ ! -f "$appImage" ]; then
    echo "Cursor app image not found"
    exit 1
fi

# Add execution permission to the appImage
chmod +x $appImage

# Move the appImage to /opt/cursor.appimage
sudo mv $appImage /opt/cursor.appimage

echo "Cursor app image moved to /opt/cursor.appimage"

exit 0

