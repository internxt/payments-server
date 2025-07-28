FROM node:22-alpine
LABEL author="internxt"

WORKDIR /

# Add useful packages
RUN apk add git curl

COPY . ./

# Install deps
RUN yarn && yarn build && yarn --production && yarn cache clean

# Create prometheus directories
RUN mkdir -p /mnt/prometheusvol{1,2}

# Start server
CMD node /dist/index.js
