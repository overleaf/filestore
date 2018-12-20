FROM node:10.14.1

# we also need imagemagick but it is already in the node docker image
RUN apt-get update && apt-get install -y --no-install-recommends ghostscript optipng
