FROM node:22-alpine
LABEL author="internxt"

WORKDIR /usr/app

COPY package*.json ./

COPY .npmrc ./

RUN yarn

COPY . ./

CMD yarn dev
