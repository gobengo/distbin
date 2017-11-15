#!/bin/bash

# set -x
# set -e

# Add local user
# Either use the LOCAL_USER_ID if passed in at runtime or
# fallback

USER_ID=${LOCAL_USER_ID:-9001}
USER_NAME=distbin
echo "Starting with UID : $USER_ID"
useradd --shell /bin/bash -u $USER_ID -o -c "" -m $USER_NAME
export HOME=/home/$USER_NAME
mkdir -p $HOME
chown -R $USER_NAME:$USER_NAME $HOME
chown -R $USER_NAME:$USER_NAME /etc/authbind/byport/

exec /usr/local/bin/gosu $USER_NAME authbind --deep "$@"
