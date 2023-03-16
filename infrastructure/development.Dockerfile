FROM mhart/alpine-node:16
LABEL author="internxt"

WORKDIR /

# Add useful packages
RUN apk add git curl

COPY . ./

# Install deps
RUN yarn && yarn build

# Create prometheus directories
RUN mkdir -p /mnt/prometheusvol{1,2}

# Start server
CMD node /dist/index.js
